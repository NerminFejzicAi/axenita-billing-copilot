/**
 * `GET /api/v1/patient-references/{id}` against a real PostgreSQL — the `P5-I4A` read contract
 * end to end, including the `FORCE ROW LEVEL SECURITY` boundary it depends on.
 *
 * Normative sources: `03` §3.2, §3.4, §3.7.1, §8, §9 and §11; `02` §11, §17.1 and
 * `013_rls_policies_phase5`; `09` §4, §4.2 and §18.1 threat `T1`; `15` §5; D-060 clause 38;
 * D-062 part H.1; D-072 `OD-P5-I4-13`; D-073 `OD-P5-I4A-1` … `OD-P5-I4A-3`; `08` §12.10 points
 * 4-6 and §12.10a points 1-18.
 *
 * WHY THIS SUITE AND NOT AN `*.e2e-spec.ts`
 *
 * The properties under test are database properties: the `patient_references_select` policy that
 * makes another practice's row invisible under `FORCE ROW LEVEL SECURITY`, the transaction-local
 * `app.practice_id` a rejected request must roll back, and the real HTTP surface built on top of
 * both. `pnpm test:e2e` boots the application with stub dependency listeners and no PostgreSQL at
 * all, so it could prove none of them. This suite therefore runs against a disposable database,
 * never the development database `copilot` and never the shared `copilot_test` (`08` §3).
 *
 * WHY IT OWNS ITS OWN DATABASE
 *
 * It inserts `patient_references` rows — including a row belonging to a practice the caller is
 * NOT admitted to, which is the whole cross-tenant proof — and the frozen phase 3 seed contains
 * none. Adding them to the SHARED disposable database would change row counts other phase 5
 * security specs assert against. This suite therefore creates, migrates, seeds and drops a
 * database of its own, exactly as `phase3-practice-read.security.ts` does and for the same
 * reason.
 *
 * NO SCHEMA, MIGRATION, POLICY, GRANT OR SEED FILE IS MODIFIED BY THIS SUITE. The fixture rows
 * are written through the CANONICAL runtime path: the `copilot_app` credential, under an
 * established `app.practice_id`, admitted by the very `patient_references_insert` policy the
 * migration created. `patient_references` is deliberately NOT added to the D-048 trusted
 * maintenance allowlist — it does not need to be, because the runtime role can write its own
 * tenant's rows by design (`02` §29.5 grants `INSERT`).
 */

import { type NestExpressApplication } from '@nestjs/platform-express';
import { type Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHASE_3_SEED_IDS, PHASE_3_SEED_SUBJECTS, runPhase3Seed } from '../prisma/seed.js';
import { type TenantStatement } from '../src/database/tenant-statement.js';
import {
  IDENTITY_DATABASE,
  type IdentityBootstrapSession,
  type IdentityDatabase,
} from '../src/identity/infrastructure/identity-database.port.js';
import { IdentityBootstrapService } from '../src/identity/application/identity-bootstrap.service.js';
import { PracticeReadService } from '../src/identity/application/practice-read.service.js';
import { PracticeSettingsReadService } from '../src/identity/application/practice-settings-read.service.js';
import { PracticeSettingsWriteService } from '../src/identity/application/practice-settings-write.service.js';
import { TenantRequestPipeline } from '../src/identity/application/tenant-request.pipeline.js';
import { PatientReferenceReadService } from '../src/patient-reference/application/patient-reference-read.service.js';
import { closeTestApplication } from './support/create-test-application.js';
import { developmentBearer } from './support/development-token.js';
import {
  createDisposableDatabase,
  dropDisposableDatabase,
  generateDisposableDatabaseName,
  type DisposableDatabase,
} from './support/disposable-database.js';
import { createIdentityTestApplication } from './support/identity-test-application.js';
import { connect } from './support/phase3-security-context.js';
import { runPrismaCli } from './support/run-prisma-cli.js';

/** The canonical spelling of the tenant context header (`03` §3.2). */
const PRACTICE_HEADER = 'X-Practice-ID';

/**
 * The admitted practice of this suite.
 *
 * The seeded `practiceAdmin` holds an ACTIVE membership in it carrying `PRACTICE_ADMIN` AND
 * `PHYSICIAN`, and `15` §5 makes `patient_reference.read` an `ALLOW` for `PHYSICIAN`. The same
 * user's membership in `practiceNord` is INACTIVE, so they cannot be admitted there at all —
 * which is exactly what makes a row stored there a genuine cross-tenant row.
 */
const ADMITTED_PRACTICE = PHASE_3_SEED_IDS.practiceDemo;
const FOREIGN_PRACTICE = PHASE_3_SEED_IDS.practiceNord;

const CALLER = PHASE_3_SEED_SUBJECTS.practiceAdmin;

const FIXTURE = {
  /** Lives in the admitted practice. `created_at` is a WHOLE SECOND: the `.000` vector. */
  ownRow: '77777777-7777-4777-8777-777777770001',
  /** Lives in the admitted practice. `created_at` carries MILLISECONDS: the `.123` vector. */
  ownRowWithMilliseconds: '77777777-7777-4777-8777-777777770002',
  /** Lives in ANOTHER practice — the cross-tenant half of the protected `404` pair. */
  foreignRow: '77777777-7777-4777-8777-777777770003',
  /** A well-formed UUID that names no row at all — the other half of the pair. */
  absentRow: '77777777-7777-4777-8777-7777777700ff',
} as const;

/** Obviously synthetic, non-PHI fixture values (`09` §9). */
const OWN_PSEUDONYM = 'P-P5I4AOWN1';
const OWN_MILLIS_PSEUDONYM = 'P-P5I4AOWN2';
const FOREIGN_PSEUDONYM = 'P-P5I4AFOR1';

/**
 * Writes the fixture rows through the RUNTIME path: `copilot_app`, one transaction per tenant,
 * with `app.practice_id` established for that tenant only.
 *
 * This is not a convenience — it is itself evidence. The `patient_references_insert` policy
 * admits a row only when `practice_id = app.practice_id`, so a fixture written this way is
 * proof that the row really belongs to the practice the test believes it belongs to.
 */
async function insertPatientReference(
  client: Client,
  row: {
    readonly id: string;
    readonly practiceId: string;
    readonly pseudonym: string;
    readonly createdAt: string;
    readonly birthYear: number | null;
    readonly sexCode: string | null;
  },
): Promise<void> {
  await client.query('begin');

  try {
    await client.query('select set_config($1, $2, true)', ['app.practice_id', row.practiceId]);

    await client.query(
      `insert into "patient_references"
         ("id", "practice_id", "source_system", "external_patient_ref_hash",
          "pseudonym", "birth_year", "sex_code", "created_at", "updated_at")
       values ($1, $2, 'MANUAL'::integration_provider, $3, $4, $5, $6, $7::timestamptz,
               current_timestamp)`,
      [
        row.id,
        row.practiceId,
        `p5i4a.${row.id.replace(/-/g, '').padEnd(64, '0')}`,
        row.pseudonym,
        row.birthYear,
        row.sexCode,
        row.createdAt,
      ],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

/**
 * Records the label of every FEATURE statement the REAL adapter executes on the REAL connection.
 *
 * WHY THIS AND NOT `pg_stat_user_tables`
 *
 * PostgreSQL's cumulative statistics are flushed asynchronously and rate-limited per backend, so
 * a counter read immediately after a request may or may not have moved yet. A zero-read proof
 * built on it would be a race, and a security control that sometimes reports the wrong answer is
 * worse than none. This observer instead wraps the SINGLE `IdentityDatabase` provider of the
 * running application and counts statements at the moment they are issued — on the production
 * code path, against the real database, deterministically.
 *
 * It OBSERVES and changes nothing: the session it hands the application delegates every method,
 * including the statement itself, to the real session through the prototype chain. It adds no
 * transaction, no connection and no behaviour.
 */
interface StatementObserver {
  readonly labels: readonly string[];
  reset(): void;
}

function observeTenantStatements(application: NestExpressApplication): StatementObserver {
  const database = application.get<IdentityDatabase>(IDENTITY_DATABASE);
  const labels: string[] = [];
  const runBootstrapTransaction = database.runBootstrapTransaction.bind(database);

  database.runBootstrapTransaction = async <T>(
    work: (session: IdentityBootstrapSession) => Promise<T>,
  ): Promise<T> =>
    runBootstrapTransaction(async (session) => {
      // `Object.create` keeps the real session as the prototype, so every method — and the
      // private transaction client they close over — resolves to the real one.
      const observed: IdentityBootstrapSession = Object.create(session) as IdentityBootstrapSession;

      Object.defineProperty(observed, 'runTenantStatement', {
        value: async <TRow>(statement: TenantStatement): Promise<readonly TRow[]> => {
          labels.push(statement.label);
          return session.runTenantStatement<TRow>(statement);
        },
      });

      return work(observed);
    });

  return {
    labels,
    reset: (): void => {
      labels.length = 0;
    },
  };
}

/**
 * The BYTE LENGTH half of an Express weak `ETag` (`W/"<length>-<digest>"`).
 *
 * The digest is computed over the whole body, which carries the per-request `requestId`, so two
 * responses NEVER share it — not even two responses to the identical request. It is therefore a
 * function of the correlation id and of nothing about the resource, and comparing it would assert
 * a property no correct implementation can have. The length prefix is the observable part that
 * could differ if the two documents differed, so that is what is compared.
 */
function entityTagLength(value: string | undefined): string | undefined {
  return value?.replace(/^W\//, '').replace(/^"/, '').split('-')[0];
}

/** The per-request Problem Details members, which no two responses can share. */
function withoutPerRequestMembers(body: Record<string, unknown>): Record<string, unknown> {
  // `requestId` is the `03` §3.5 correlation id and is unique per request by construction.
  //
  // `instance` is the RFC 9457 request-target member frozen by `03` §8 and D-008. It is a pure
  // ECHO of the request line the caller itself just sent: it is byte-identical for two requests
  // that name the same identifier, whatever the server found, so it can carry no information
  // about any row. It is removed here so that a comparison ACROSS two different identifiers
  // still asserts everything the server actually decided. The stronger property — that the
  // document does not change when a foreign row starts existing — is asserted separately, with
  // the identifier held constant and `instance` therefore included.
  const { instance: _instance, requestId: _requestId, ...rest } = body;

  return rest;
}

describe('GET /api/v1/patient-references/{id}', () => {
  let disposable: DisposableDatabase;
  let app: NestExpressApplication;
  let appClient: Client;
  let statements: StatementObserver;

  beforeAll(async () => {
    disposable = await createDisposableDatabase(generateDisposableDatabaseName());

    expect(disposable.name).toMatch(/^copilot_gate3b_/);
    for (const url of [disposable.app, disposable.migration]) {
      expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname);
      expect(new URL(url).pathname).toBe(`/${disposable.name}`);
    }

    runPrismaCli(['migrate', 'deploy'], disposable.migration);
    await runPhase3Seed(disposable.migration);

    appClient = await connect(disposable.app);

    await insertPatientReference(appClient, {
      id: FIXTURE.ownRow,
      practiceId: ADMITTED_PRACTICE,
      pseudonym: OWN_PSEUDONYM,
      createdAt: '2026-07-18T10:00:00Z',
      birthYear: 1968,
      sexCode: 'F',
    });

    await insertPatientReference(appClient, {
      id: FIXTURE.ownRowWithMilliseconds,
      practiceId: ADMITTED_PRACTICE,
      pseudonym: OWN_MILLIS_PSEUDONYM,
      createdAt: '2026-07-18T10:00:00.123Z',
      birthYear: null,
      sexCode: null,
    });

    await insertPatientReference(appClient, {
      id: FIXTURE.foreignRow,
      practiceId: FOREIGN_PRACTICE,
      pseudonym: FOREIGN_PSEUDONYM,
      createdAt: '2026-07-18T10:00:00Z',
      birthYear: 1970,
      sexCode: 'M',
    });

    app = await createIdentityTestApplication(disposable);
    statements = observeTenantStatements(app);
  }, 180000);

  afterAll(async () => {
    await appClient.end();
    await closeTestApplication(app);

    if (disposable !== undefined) {
      await dropDisposableDatabase(disposable);
    }
  }, 60000);

  /**
   * One request. `options.header: null` sends no `X-Practice-ID`; any string is sent verbatim.
   */
  async function readPatientReference(
    resourceId: string,
    options: { header?: string | null; subject?: string } = {},
  ): Promise<{
    status: number;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }> {
    const headers: Record<string, string> = {
      Authorization: developmentBearer(options.subject ?? CALLER),
    };
    const header = options.header === undefined ? ADMITTED_PRACTICE : options.header;

    if (header !== null) {
      headers[PRACTICE_HEADER] = header;
    }

    const response = await request(app.getHttpServer())
      .get(`/api/v1/patient-references/${resourceId}`)
      .set(headers);

    return {
      status: response.status,
      body: response.body as Record<string, unknown>,
      headers: response.headers,
    };
  }

  describe('the admitted read (03 §11, 08 §12.10 point 4)', () => {
    it('returns 200 with exactly the six public fields', async () => {
      const { status, body } = await readPatientReference(FIXTURE.ownRow);

      expect(status).toBe(200);
      expect(body).toEqual({
        id: FIXTURE.ownRow,
        pseudonym: OWN_PSEUDONYM,
        birthYear: 1968,
        sexCode: 'F',
        sourceSystem: 'MANUAL',
        createdAt: '2026-07-18T10:00:00.000Z',
      });
      expect(Object.keys(body)).toHaveLength(6);
    });

    it('exposes NO internal field of the stored row (M-1)', async () => {
      const { body } = await readPatientReference(FIXTURE.ownRow);
      const rendered = JSON.stringify(body);

      for (const forbidden of [
        'practiceId',
        'practice_id',
        'updatedAt',
        'updated_at',
        'externalPatientRefHash',
        'external_patient_ref_hash',
        'externalPatientRefCiphertext',
        'external_patient_ref_ciphertext',
        'externalPatientRefIv',
        'external_patient_ref_iv',
        'externalPatientRefAuthTag',
        'external_patient_ref_auth_tag',
        'encryptionAlgorithm',
        'encryption_algorithm',
        'encryptionVersion',
        'encryptionKeyRef',
        'encryptionKeyVersion',
      ]) {
        expect([forbidden, Object.keys(body).includes(forbidden)]).toEqual([forbidden, false]);
      }

      // The stored hash value itself must not appear anywhere in the response, under any name
      // (D-060 clause 38 — absent from EVERY response by design).
      expect(rendered).not.toContain('p5i4a.');
      expect(rendered).not.toContain(ADMITTED_PRACTICE);
    });

    it('renders both canonical createdAt vectors (D-073 OD-P5-I4A-3)', async () => {
      const whole = await readPatientReference(FIXTURE.ownRow);
      const millis = await readPatientReference(FIXTURE.ownRowWithMilliseconds);

      // Stored as `timestamptz(6)`; rendered at millisecond precision with `.000` emitted.
      expect(whole.body['createdAt']).toBe('2026-07-18T10:00:00.000Z');
      expect(millis.body['createdAt']).toBe('2026-07-18T10:00:00.123Z');

      for (const value of [whole.body['createdAt'], millis.body['createdAt']]) {
        expect(String(value)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(String(value)).not.toContain('+00:00');
        expect(String(value)).not.toMatch(/\.\d{6}Z$/);
      }
    });

    it('renders both nullable members as null rather than omitting them', async () => {
      const { body } = await readPatientReference(FIXTURE.ownRowWithMilliseconds);

      expect(body['birthYear']).toBeNull();
      expect(body['sexCode']).toBeNull();
      expect(Object.keys(body)).toHaveLength(6);
    });
  });

  describe('tenant scope is HEADER_ONLY (D-073 OD-P5-I4A-1, 08 §12.10a points 2-4)', () => {
    it('requires X-Practice-ID exactly as every other tenant route does', async () => {
      const { status, body } = await readPatientReference(FIXTURE.ownRow, { header: null });

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: 'PRACTICE_CONTEXT_REQUIRED', status: 400 });
    });

    it('rejects a malformed X-Practice-ID with the unchanged code', async () => {
      const { status, body } = await readPatientReference(FIXTURE.ownRow, { header: 'not-a-uuid' });

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: 'PRACTICE_CONTEXT_INVALID', status: 400 });
    });

    it('admits the practice named by the header, and no other', async () => {
      // The SAME caller, the SAME resource: admitted through `demo`, refused through `nord`,
      // where their membership is inactive. The header is the only thing that differs, which is
      // what `HEADER_ONLY` means.
      const admitted = await readPatientReference(FIXTURE.ownRow);
      const foreignHeader = await readPatientReference(FIXTURE.ownRow, {
        header: FOREIGN_PRACTICE,
      });

      expect(admitted.status).toBe(200);
      expect(foreignHeader.status).toBe(403);
      expect(foreignHeader.body).toMatchObject({ code: 'ACCESS_DENIED' });
    });

    it('refuses a caller who does not derive patient_reference.read', async () => {
      // The seeded physician is ACTIVE in `nord` with ZERO roles, so no permission is derived.
      const { status, body } = await readPatientReference(FIXTURE.ownRow, {
        subject: PHASE_3_SEED_SUBJECTS.physician,
        header: FOREIGN_PRACTICE,
      });

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED' });
    });

    it('refuses an unauthenticated caller before anything else', async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/v1/patient-references/${FIXTURE.ownRow}`,
      );

      expect(response.status).toBe(401);
    });
  });

  describe('existing PRACTICE_PATH routes are unchanged (D-073, 08 §12.10a points 1 and 7)', () => {
    async function readPractice(
      practiceId: string,
      header: string,
    ): Promise<{ status: number; body: Record<string, unknown> }> {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/practices/${practiceId}`)
        .set({ Authorization: developmentBearer(CALLER), [PRACTICE_HEADER]: header });

      return { status: response.status, body: response.body as Record<string, unknown> };
    }

    it('still admits a matching path and header', async () => {
      const { status, body } = await readPractice(ADMITTED_PRACTICE, ADMITTED_PRACTICE);

      expect(status).toBe(200);
      expect(body['id']).toBe(ADMITTED_PRACTICE);
    });

    it('still answers a path/header mismatch with 403 ACCESS_DENIED', async () => {
      const { status, body } = await readPractice(FOREIGN_PRACTICE, ADMITTED_PRACTICE);

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    });

    it('still answers the settings GET and PATCH surfaces unchanged', async () => {
      const settings = await request(app.getHttpServer())
        .get(`/api/v1/practices/${ADMITTED_PRACTICE}/settings`)
        .set({ Authorization: developmentBearer(CALLER), [PRACTICE_HEADER]: ADMITTED_PRACTICE });

      expect(settings.status).toBe(200);
      expect(settings.headers['etag']).toBeDefined();

      const mismatch = await request(app.getHttpServer())
        .get(`/api/v1/practices/${FOREIGN_PRACTICE}/settings`)
        .set({ Authorization: developmentBearer(CALLER), [PRACTICE_HEADER]: ADMITTED_PRACTICE });

      expect(mismatch.status).toBe(403);
      expect((mismatch.body as Record<string, unknown>)['code']).toBe('ACCESS_DENIED');
    });
  });

  describe('malformed identifier (D-073 OD-P5-I4A-2, 08 §12.10a points 8-11)', () => {
    const MALFORMED = [
      'not-a-uuid',
      '77777777-7777-4777-8777-77777777000',
      '77777777-7777-4777-8777-7777777700011',
      '77777777777747778777777777770001',
      '77777777-7777-4777-8777-77777777000g',
      '00000000-0000-0000-0000-00000000000%2E',
    ] as const;

    it.each(MALFORMED)('answers %s with 400 VALIDATION_ERROR', async (malformed) => {
      const { status, body } = await readPatientReference(malformed);

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
    });

    it('answers every malformed identifier with a byte-identical document', async () => {
      const bodies: string[] = [];

      for (const malformed of MALFORMED) {
        const { body } = await readPatientReference(malformed);

        bodies.push(JSON.stringify(withoutPerRequestMembers(body)));
      }

      // Every decision the server took is the same for every malformed input: same type, same
      // title, same status, same code, same static detail, same member order, no `errors`.
      for (const body of bodies) {
        expect(body).toBe(bodies[0]);
      }
    });

    it('reflects the identifier in NO member the route authors', async () => {
      const crafted = 'REFLECTME9f2c1a7b';
      const { body } = await readPatientReference(crafted);

      // Every member the endpoint decides — and every fragment of the input, down to four
      // characters, in each of them.
      const authored = JSON.stringify(withoutPerRequestMembers(body));

      expect(authored).not.toContain(crafted);

      for (let length = 4; length <= crafted.length; length += 1) {
        for (let start = 0; start + length <= crafted.length; start += 1) {
          expect(authored).not.toContain(crafted.slice(start, start + length));
        }
      }

      // The detail is the static one, verbatim, and carries nothing of the request.
      expect(body['detail']).toBe('The requested resource identifier is not valid.');
      expect(body['title']).toBe('Validation failed');
      expect(body['code']).toBe('VALIDATION_ERROR');
    });

    it('places the request target ONLY in the frozen RFC 9457 instance member', async () => {
      // `instance` is the request-target member of the Problem Details document frozen by
      // `03` §8 and D-008, produced by the single shared filter for EVERY route in the system —
      // including the already-canonical `403` of `GET /practices/{practiceId}`, whose path
      // likewise carries a caller-supplied identifier. `P5-I4A` neither adds it nor may remove
      // it: changing the frozen error shape is a contract change of its own.
      //
      // It is asserted here rather than left implicit, so the one place the request target
      // appears is pinned and cannot silently grow into a second, endpoint-authored echo.
      const crafted = 'REFLECTME9f2c1a7b';
      const { body } = await readPatientReference(crafted);

      expect(body['instance']).toBe(`/api/v1/patient-references/${crafted}`);

      const occurrences = Object.entries(body).filter(
        ([, value]) => typeof value === 'string' && value.includes(crafted),
      );

      expect(occurrences.map(([member]) => member)).toEqual(['instance']);
    });

    it('carries no errors[] member', async () => {
      const { body } = await readPatientReference('not-a-uuid');

      expect(Object.keys(body)).not.toContain('errors');
    });

    it('performs ZERO patient_references reads (MALFORMED_RESOURCE_UUID_DB_READS = 0)', async () => {
      // Counted on the PRODUCTION path, against the real database, at the moment each statement
      // is issued. A well-formed lookup runs first so the counter is proven to MOVE at all — an
      // assertion that can never fail is not an assertion.
      statements.reset();
      await readPatientReference(FIXTURE.ownRow);

      expect(statements.labels).toEqual(['select patient_reference']);

      for (const malformed of MALFORMED) {
        statements.reset();

        const { status } = await readPatientReference(malformed);

        expect([malformed, status]).toEqual([malformed, 400]);
        // No tenant-scoped read, no untenanted read and no cross-tenant lookup.
        expect([malformed, [...statements.labels]]).toEqual([malformed, []]);
      }
    });
  });

  describe('protected 404 pair (D-073, 09 §18.1 T1, 08 §12.10 points 5-6)', () => {
    it('answers a valid, nonexistent id with 404 RESOURCE_NOT_FOUND', async () => {
      const { status, body } = await readPatientReference(FIXTURE.absentRow);

      expect(status).toBe(404);
      expect(body).toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
    });

    it('answers a valid, cross-tenant id with the SAME 404 RESOURCE_NOT_FOUND', async () => {
      const { status, body } = await readPatientReference(FIXTURE.foreignRow);

      expect(status).toBe(404);
      expect(body).toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
    });

    it('answers both causes with the same document and the same headers', async () => {
      const absent = await readPatientReference(FIXTURE.absentRow);
      const foreign = await readPatientReference(FIXTURE.foreignRow);

      expect(foreign.status).toBe(absent.status);
      // Every member the server decides — type, title, status, code, detail, member order and
      // the absence of `errors` — is identical.
      expect(JSON.stringify(withoutPerRequestMembers(foreign.body))).toBe(
        JSON.stringify(withoutPerRequestMembers(absent.body)),
      );

      for (const header of ['content-type', 'content-length', 'cache-control', 'vary']) {
        expect([header, foreign.headers[header]]).toEqual([header, absent.headers[header]]);
      }

      expect(entityTagLength(foreign.headers['etag'])).toBe(
        entityTagLength(absent.headers['etag']),
      );
    });

    it('does not change at all when the row STARTS EXISTING in another practice', async () => {
      // THE SHARPEST FORM OF "NO EXISTENCE ORACLE", and the one that holds the identifier
      // constant so that even the RFC 9457 `instance` echo is identical: the same caller asks
      // for the same id twice, and between the two requests the row comes into existence in a
      // practice the caller is not admitted to. If anything observable moved, the endpoint would
      // be an oracle for the other tenant's contents.
      const probe = '77777777-7777-4777-8777-7777777700a1';

      const before = await readPatientReference(probe);

      expect(before.status).toBe(404);

      await insertPatientReference(appClient, {
        id: probe,
        practiceId: FOREIGN_PRACTICE,
        pseudonym: 'P-P5I4AORC1',
        createdAt: '2026-07-18T10:00:00Z',
        birthYear: 1955,
        sexCode: 'M',
      });

      // It really is there, in the other tenant.
      const stored = await appClient.query<{ id: string }>(
        `select "id" from "patient_references"
          where "id" = $1::uuid
            and "practice_id" = $2::uuid`,
        [probe, FOREIGN_PRACTICE],
      );

      expect(stored.rowCount).toBe(0); // invisible without that tenant's context — FORCE RLS

      const after = await readPatientReference(probe);

      expect(after.status).toBe(before.status);
      // `instance` is identical here because the identifier is, so it is INCLUDED in the
      // comparison: only the per-request correlation id may differ.
      expect(JSON.stringify({ ...after.body, requestId: undefined })).toBe(
        JSON.stringify({ ...before.body, requestId: undefined }),
      );

      for (const header of ['content-type', 'content-length', 'cache-control', 'vary']) {
        expect([header, after.headers[header]]).toEqual([header, before.headers[header]]);
      }

      expect(entityTagLength(after.headers['etag'])).toBe(entityTagLength(before.headers['etag']));
    });

    it('leaks nothing of the foreign row that genuinely exists', async () => {
      const { body } = await readPatientReference(FIXTURE.foreignRow);
      const rendered = JSON.stringify(body);

      expect(rendered).not.toContain(FOREIGN_PSEUDONYM);
      expect(rendered).not.toContain(FOREIGN_PRACTICE);
      // The stored external-reference hash is absent from every response by design.
      expect(rendered).not.toContain('p5i4a.');
    });

    it('issues EXACTLY ONE statement for each cause — no existence pre-read', async () => {
      statements.reset();
      await readPatientReference(FIXTURE.absentRow);
      const absentLabels = [...statements.labels];

      statements.reset();
      await readPatientReference(FIXTURE.foreignRow);
      const foreignLabels = [...statements.labels];

      expect(absentLabels).toEqual(['select patient_reference']);
      expect(foreignLabels).toEqual(absentLabels);
    });
  });

  describe('exactly one tenant admission pipeline (D-073, 08 §12.10a point 5)', () => {
    it('shares ONE TenantRequestPipeline instance across every tenant route', () => {
      // `TENANT_ADMISSION_PIPELINE_COUNT = 1`, asserted against the RUNNING container rather
      // than against the module metadata: the patient-reference module IMPORTS the identity
      // module, so the pipeline the new route was constructed with must be the very object the
      // practice routes were constructed with. Re-providing it would produce a second instance
      // here — a second, independently evolvable admission path — and this assertion would fail.
      const pipeline = app.get(TenantRequestPipeline, { strict: false });

      const holders: readonly { readonly name: string; readonly service: object }[] = [
        { name: 'PracticeReadService', service: app.get(PracticeReadService, { strict: false }) },
        {
          name: 'PracticeSettingsReadService',
          service: app.get(PracticeSettingsReadService, { strict: false }),
        },
        {
          name: 'PracticeSettingsWriteService',
          service: app.get(PracticeSettingsWriteService, { strict: false }),
        },
        {
          name: 'PatientReferenceReadService',
          service: app.get(PatientReferenceReadService, { strict: false }),
        },
      ];

      for (const { name, service } of holders) {
        const held = (service as unknown as { readonly tenantRequests: TenantRequestPipeline })
          .tenantRequests;

        expect([name, held === pipeline]).toEqual([name, true]);
      }
    });

    it('shares ONE IdentityBootstrapService too — one authenticated chain', () => {
      const bootstrap = app.get(IdentityBootstrapService, { strict: false });
      const patientReferences = app.get(PatientReferenceReadService, { strict: false });

      const held = (
        patientReferences as unknown as { readonly identityBootstrap: IdentityBootstrapService }
      ).identityBootstrap;

      expect(held).toBe(bootstrap);
    });
  });

  describe('FORCE ROW LEVEL SECURITY is the primary boundary (09 §4, 02 §17.1)', () => {
    it('keeps FORCE row level security enabled on patient_references', async () => {
      const result = await appClient.query<{ enabled: boolean; forced: boolean }>(
        `select c.relrowsecurity as enabled, c.relforcerowsecurity as forced
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'patient_references'`,
      );

      expect(result.rows[0]).toEqual({ enabled: true, forced: true });
    });

    it('shows the foreign row only to its OWN tenant context, and to no other', async () => {
      // The database half of the cross-tenant proof, independent of the HTTP surface: the same
      // statement, the same connection, two tenant contexts, two different answers.
      const visibleIn = async (practiceId: string): Promise<number> => {
        await appClient.query('begin');

        try {
          await appClient.query('select set_config($1, $2, true)', ['app.practice_id', practiceId]);

          const result = await appClient.query<{ id: string }>(
            'select "id" from "patient_references" where "id" = $1::uuid',
            [FIXTURE.foreignRow],
          );

          return result.rowCount ?? 0;
        } finally {
          await appClient.query('rollback');
        }
      };

      expect(await visibleIn(FOREIGN_PRACTICE)).toBe(1);
      expect(await visibleIn(ADMITTED_PRACTICE)).toBe(0);
    });

    it('shows NO row at all when no tenant context is established — fail closed', async () => {
      await appClient.query('begin');

      try {
        const result = await appClient.query<{ total: string }>(
          'select count(*)::text as total from "patient_references"',
        );

        expect(result.rows[0]?.total).toBe('0');
      } finally {
        await appClient.query('rollback');
      }
    });
  });
});
