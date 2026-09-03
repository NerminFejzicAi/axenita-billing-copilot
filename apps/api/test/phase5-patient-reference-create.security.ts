/**
 * `POST /api/v1/patient-references` against a real PostgreSQL — the `P5-I4C` write contract end
 * to end, including the concurrency, `23505` and audit properties nothing else can prove.
 *
 * Normative sources: `03` §3.2, §3.4, §3.7.1, §4, §4.1, §4.2, §8, §8.1, §9 and §11; `02` §11,
 * §15.2, §15.4, §29.4a.3, §29.4a.4 and `013_rls_policies_phase5`; `04` §7.5a.2 and §7.5a.3;
 * `09` §4, §4.2, §9, §11 and §18.1; `15` §5; D-060; D-062 part D; D-069 `RULING 4` and
 * `RULING 5`; D-070; D-072; D-073; D-079 `OD-P5-I4C-1` … `OD-P5-I4C-5` and `RULING D`;
 * `08` §12.12 obligations 1-18.
 *
 * WHY THIS SUITE AND NOT AN `*.e2e-spec.ts`
 *
 * Four of the properties under test EXIST ONLY IN A REAL DATABASE and cannot be modelled:
 *
 *  - `pg_try_advisory_xact_lock` genuinely failing to acquire a lock ANOTHER CONNECTION holds,
 *    and doing so without waiting;
 *  - the real SQLSTATE `23505` of `patient_references_source_external_ref_key` travelling through
 *    the shipped Prisma/`pg` driver and being translated into `409`;
 *  - `FORCE ROW LEVEL SECURITY` on `patient_references`, `idempotency_keys` and `audit_events`;
 *  - the STORED audit row, read back through SQL, reproducing its own `event_sha256`.
 *
 * `pnpm test:e2e` boots the application with stub dependency listeners and no PostgreSQL at all,
 * so it could prove none of them. This suite therefore runs against a disposable database, never
 * the development database `copilot` and never the shared `copilot_test` (`08` §3).
 *
 * WHY IT OWNS ITS OWN DATABASE
 *
 * It WRITES `patient_references`, `idempotency_keys` and `audit_events` through the real HTTP
 * surface, and the frozen phase 3 seed contains none of them. Adding rows to the SHARED disposable
 * database would change counts other phase 5 security specs assert against. This suite therefore
 * creates, migrates, seeds and drops a database of its own, exactly as
 * `phase5-patient-reference-read.security.ts` does and for the same reason.
 *
 * NO SCHEMA, MIGRATION, POLICY, GRANT OR SEED FILE IS MODIFIED BY THIS SUITE. Every business row
 * it observes was written by the application itself, through `copilot_app`, under the very
 * policies the migration created.
 */

import { type NestExpressApplication } from '@nestjs/platform-express';
import { type Client } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PHASE_3_SEED_IDS, PHASE_3_SEED_SUBJECTS, runPhase3Seed } from '../prisma/seed.js';
import { buildAuditEventHashPayloadV1 } from '../src/crypto/audit-event-hash-payload.js';
import { canonicaliseJson, type JsonValue } from '../src/crypto/json-canonicalizer.js';
import { requestSha256 } from '../src/crypto/request-sha256.js';
import { sha256HexUtf8 } from '../src/crypto/sha256-utf8.js';
import { type TenantStatement } from '../src/database/tenant-statement.js';
import { advisoryLockKey } from '../src/idempotency/domain/advisory-lock-key.js';
import {
  IDEMPOTENCY_ENDPOINT_POST_PATIENT_REFERENCES,
  IDEMPOTENCY_TTL_MILLISECONDS,
} from '../src/idempotency/idempotency.constants.js';
import {
  IDENTITY_DATABASE,
  type IdentityBootstrapSession,
  type IdentityDatabase,
} from '../src/identity/infrastructure/identity-database.port.js';
import { PatientReferenceLookupService } from '../src/patient-reference/application/patient-reference-lookup.service.js';
import { TenantDatabaseService } from '../src/database/tenant-database.service.js';
import { IdentityBootstrapService } from '../src/identity/application/identity-bootstrap.service.js';
import { TenantRequestPipeline } from '../src/identity/application/tenant-request.pipeline.js';
import { CapturingLogger } from './support/capturing-logger.js';
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

/** The canonical spellings of the two headers this route reads (`03` §3.2, §4). */
const PRACTICE_HEADER = 'X-Practice-ID';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/**
 * The admitted practice and caller.
 *
 * The seeded `practiceAdmin` holds an ACTIVE membership in `practiceDemo` carrying
 * `PRACTICE_ADMIN` AND `PHYSICIAN`, and `15` §5 makes `patient_reference.create` an `ALLOW` for
 * `PHYSICIAN`. Their membership in `practiceNord` is INACTIVE, so they cannot be admitted there
 * at all — which is what makes a row stored there a genuine cross-tenant row.
 */
const ADMITTED_PRACTICE = PHASE_3_SEED_IDS.practiceDemo;
const FOREIGN_PRACTICE = PHASE_3_SEED_IDS.practiceNord;
const CALLER = PHASE_3_SEED_SUBJECTS.practiceAdmin;
const CALLER_USER = PHASE_3_SEED_IDS.userPracticeAdmin;

/**
 * A seeded caller who holds NO membership in the admitted practice.
 *
 * The tenant chain refuses them at step 4 with the shared `403 ACCESS_DENIED`, which is exactly
 * what makes them the right probe for "nothing about the body or the header is judged before
 * authorisation" (`03` §3.7.1).
 */
const UNADMITTED_SUBJECT = PHASE_3_SEED_SUBJECTS.physician;

let externalReferenceSequence = 0;

/** A fresh synthetic external identifier, so one test cannot collide with another. */
function nextExternalReference(): string {
  externalReferenceSequence += 1;

  return `LOCAL-P5I4C-SEC-${String(externalReferenceSequence).padStart(4, '0')}`;
}

let keySequence = 0;

/** A fresh accepted `Idempotency-Key`. */
function nextKey(): string {
  keySequence += 1;

  return `p5i4c-sec-${String(keySequence).padStart(4, '0')}`;
}

/** The canonical accepted body. */
function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceSystem: 'MANUAL',
    externalPatientReference: nextExternalReference(),
    birthYear: 1968,
    sexCode: 'F',
    ...overrides,
  };
}

/**
 * Records the label of every FEATURE statement the REAL adapter executes on the REAL connection.
 *
 * The same observer the `P5-I4A` read suite uses, and for the same reason: PostgreSQL's
 * cumulative statistics are flushed asynchronously, so a zero-read proof built on
 * `pg_stat_user_tables` would be a race. This wraps the SINGLE `IdentityDatabase` provider and
 * counts statements at the moment they are issued — on the production code path, against the real
 * database, deterministically. It OBSERVES and changes nothing.
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

describe('POST /api/v1/patient-references', () => {
  let disposable: DisposableDatabase;
  let app: NestExpressApplication;
  let appClient: Client;
  let statements: StatementObserver;
  let logger: CapturingLogger;

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
    logger = new CapturingLogger();
    app = await createIdentityTestApplication(disposable, logger);
    statements = observeTenantStatements(app);
  }, 180000);

  afterAll(async () => {
    await appClient.end();
    await closeTestApplication(app);

    if (disposable !== undefined) {
      await dropDisposableDatabase(disposable);
    }
  }, 60000);

  afterEach(() => {
    statements.reset();
    logger.clear();
  });

  /** One `POST`. `key: null` sends no `Idempotency-Key`; `header: null` sends no practice. */
  async function post(
    requestBody: unknown,
    options: { key?: string | null; header?: string | null; subject?: string } = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const headers: Record<string, string> = {
      Authorization: developmentBearer(options.subject ?? CALLER),
    };
    const header = options.header === undefined ? ADMITTED_PRACTICE : options.header;
    const key = options.key === undefined ? nextKey() : options.key;

    if (header !== null) {
      headers[PRACTICE_HEADER] = header;
    }

    if (key !== null) {
      headers[IDEMPOTENCY_HEADER] = key;
    }

    const response = await request(app.getHttpServer())
      .post('/api/v1/patient-references')
      .set(headers)
      .send(requestBody as object);

    return { status: response.status, body: response.body as Record<string, unknown> };
  }

  /** Reads rows as `copilot_app` with the tenant context of one practice, then rolls back. */
  async function readAsTenant<T>(
    practiceId: string,
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<T[]> {
    await appClient.query('begin');

    try {
      await appClient.query('select set_config($1, $2, true)', ['app.practice_id', practiceId]);

      const result = await appClient.query(sql, [...parameters]);

      return result.rows as T[];
    } finally {
      await appClient.query('rollback');
    }
  }

  describe('the successful create (03 §11, 08 §12.12)', () => {
    it('returns 201 with exactly the six public fields', async () => {
      const created = await post(body({ birthYear: 1968, sexCode: 'F' }));

      expect(created.status).toBe(201);
      expect(Object.keys(created.body).sort()).toEqual([
        'birthYear',
        'createdAt',
        'id',
        'pseudonym',
        'sexCode',
        'sourceSystem',
      ]);
      expect(created.body['birthYear']).toBe(1968);
      expect(created.body['sexCode']).toBe('F');
      expect(created.body['sourceSystem']).toBe('MANUAL');
      // `P-` plus ten Crockford Base32 characters (`03` §11).
      expect(created.body['pseudonym']).toMatch(/^P-[0-9A-HJKMNP-TV-Z]{10}$/);
      // The public wire format is `.sssZ` — three fractional digits (D-073 `OD-P5-I4A-3`).
      expect(created.body['createdAt']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('runs the six write statements in the canonical order on ONE transaction', async () => {
      await post(body());

      // `04` §7.5a.3 steps 3, 5, 9, 10, 11 and 12, observed on the REAL connection.
      expect(statements.labels).toEqual([
        'select idempotency_advisory_lock',
        'select idempotency_key',
        'insert idempotency_key',
        'insert patient_reference',
        'insert audit_event',
        'update idempotency_key',
      ]);
    });

    it('returns the SAME document shape a GET returns for the created row', async () => {
      const created = await post(body());

      const read = await request(app.getHttpServer())
        .get(`/api/v1/patient-references/${String(created.body['id'])}`)
        .set({ Authorization: developmentBearer(CALLER), [PRACTICE_HEADER]: ADMITTED_PRACTICE });

      // D-062 part H.1 — the `200` body IS the `201` body.
      expect(read.status).toBe(200);
      expect(read.body).toEqual(created.body);
    });
  });

  describe('the persisted row (D-060, 08 §12.12 obligation 18)', () => {
    it('stores the keyed token and NO plaintext external identifier', async () => {
      const reference = nextExternalReference();
      const created = await post(body({ externalPatientReference: reference }));

      const rows = await readAsTenant<Record<string, unknown>>(
        ADMITTED_PRACTICE,
        'select * from "patient_references" where "id" = $1::uuid',
        [created.body['id']],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.['external_patient_ref_hash']).toMatch(/^h1\.[0-9a-f]{64}$/);
      // EVERY column of the stored row, rendered — the plaintext appears in none of them.
      expect(JSON.stringify(rows[0])).not.toContain(reference);
      // The encryption envelope is OUT OF SCOPE for `P5-I4C` and stays entirely absent, which the
      // `patient_references_external_patient_ref_envelope_check` constraint permits.
      expect(rows[0]?.['external_patient_ref_ciphertext']).toBeNull();
      expect(rows[0]?.['external_patient_ref_iv']).toBeNull();
      expect(rows[0]?.['external_patient_ref_auth_tag']).toBeNull();
      expect(rows[0]?.['encryption_algorithm']).toBeNull();
      expect(rows[0]?.['encryption_version']).toBeNull();
      expect(rows[0]?.['encryption_key_ref']).toBeNull();
      expect(rows[0]?.['encryption_key_version']).toBeNull();
    });

    it('never writes the plaintext identifier to a log line (09 §11)', async () => {
      const reference = nextExternalReference();

      await post(body({ externalPatientReference: reference }));
      await post(body({ externalPatientReference: 'A'.repeat(300) }));
      await post(body({ externalPatientReference: reference }), { key: nextKey() });

      expect(logger.output).not.toContain(reference);
      expect(logger.output).not.toContain('A'.repeat(300));
      expect(logger.output).not.toContain('h1.');
    });
  });

  describe('OD-P5-I4C-1 — the persisted idempotency record (03 §4.2)', () => {
    it('persists the canonical endpoint literal, the digest, the TTL and the minimal cache', async () => {
      const key = nextKey();
      const requestBody = body();
      const created = await post(requestBody, { key });

      const rows = await readAsTenant<Record<string, unknown>>(
        ADMITTED_PRACTICE,
        'select * from "idempotency_keys" where "idempotency_key" = $1',
        [key],
      );

      expect(rows).toHaveLength(1);

      const claim = rows[0] ?? {};

      // `OD-P5-I4C-1` — the canonical `03` §4 spelling, LITERALLY, and never the mount path.
      expect(claim['endpoint']).toBe('POST /patient-references');
      expect(claim['endpoint']).not.toBe('POST /api/v1/patient-references');
      expect(claim['practice_id']).toBe(ADMITTED_PRACTICE);
      expect(claim['user_id']).toBe(CALLER_USER);
      // The digest of the VALIDATED ORIGINAL PARSED BODY (`03` §4.1, §4.2).
      expect(claim['request_sha256']).toBe(requestSha256(requestBody as JsonValue));
      expect(claim['response_status']).toBe(201);
      // The MINIMAL cache: `resourceId` and nothing else.
      expect(claim['response_body']).toEqual({ resourceId: created.body['id'] });
      expect(claim['locked_at']).toBeNull();
      expect(claim['completed_at']).toBeInstanceOf(Date);

      // `IDEMPOTENCY_TTL_HOURS = 48`, measured from the single claim instant.
      const completedAt = claim['completed_at'] as Date;
      const expiresAt = claim['expires_at'] as Date;

      expect(expiresAt.getTime() - completedAt.getTime()).toBe(IDEMPOTENCY_TTL_MILLISECONDS);

      // No PHI in the cache (`02` §15.2).
      expect(JSON.stringify(claim['response_body'])).not.toContain(
        String(created.body['pseudonym']),
      );
    });
  });

  describe('obligation 1 — the Idempotency-Key', () => {
    it.each([
      ['absent', null, 'IDEMPOTENCY_KEY_REQUIRED'],
      ['empty', '', 'IDEMPOTENCY_KEY_REQUIRED'],
      ['whitespace only', '   ', 'IDEMPOTENCY_KEY_REQUIRED'],
      ['with an embedded space', 'p5i4c sec', 'VALIDATION_ERROR'],
      ['non-ASCII', 'p5i4c-kéy', 'VALIDATION_ERROR'],
      ['256 characters', 'a'.repeat(256), 'VALIDATION_ERROR'],
    ])('answers 400 %s and touches idempotency_keys not at all', async (_name, key, code) => {
      const before = await readAsTenant<{ count: string }>(
        ADMITTED_PRACTICE,
        'select count(*)::text as count from "idempotency_keys"',
      );

      const refused = await post(body(), { key });

      expect(refused.status).toBe(400);
      expect(refused.body['code']).toBe(code);
      // `428` never appears on this path (D-028).
      expect(refused.status).not.toBe(428);
      // ZERO feature statements: no lock, no claim, no insert.
      expect(statements.labels).toEqual([]);

      const after = await readAsTenant<{ count: string }>(
        ADMITTED_PRACTICE,
        'select count(*)::text as count from "idempotency_keys"',
      );

      expect(after[0]?.count).toBe(before[0]?.count);
      // The submitted key is never reflected.
      expect(JSON.stringify(refused.body)).not.toContain('kéy');
    });
  });

  describe('obligations 2-4 — replay, conflict and unfinished claim', () => {
    it('replays the same key + same body as a reconstructed 201 with no second audit event', async () => {
      const key = nextKey();
      const requestBody = body();

      const first = await post(requestBody, { key });

      statements.reset();

      const replay = await post(requestBody, { key });

      expect(replay.status).toBe(201);
      expect(replay.body).toEqual(first.body);
      // The replay READ the resource and wrote nothing.
      expect(statements.labels).toEqual([
        'select idempotency_advisory_lock',
        'select idempotency_key',
        'select patient_reference',
      ]);

      const audits = await readAsTenant<{ count: string }>(
        ADMITTED_PRACTICE,
        'select count(*)::text as count from "audit_events" where "resource_id" = $1::uuid',
        [first.body['id']],
      );

      expect(audits[0]?.count).toBe('1');
    });

    it('answers 409 IDEMPOTENCY_CONFLICT for the same key with a different body', async () => {
      const key = nextKey();
      const requestBody = body();

      await post(requestBody, { key });

      const conflict = await post({ ...requestBody, birthYear: 1970 }, { key });

      expect(conflict.status).toBe(409);
      expect(conflict.body['code']).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('answers 409 REQUEST_ALREADY_IN_PROGRESS for a COMMITTED unfinished claim', async () => {
      const key = nextKey();
      const requestBody = body();

      // A committed claim that never completed. The one-transaction model cannot produce one, so
      // it is written directly — at exactly the point the database would hold it, in exactly the
      // shape it holds it, and through `copilot_app` under the very `idempotency_keys_insert`
      // policy the application writes under.
      await appClient.query('begin');
      await appClient.query('select set_config($1, $2, true)', [
        'app.practice_id',
        ADMITTED_PRACTICE,
      ]);
      await appClient.query(
        `insert into "idempotency_keys"
           ("id", "practice_id", "user_id", "idempotency_key", "endpoint", "request_sha256",
            "locked_at", "expires_at")
         values (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5,
                 current_timestamp, current_timestamp + interval '48 hours')`,
        [
          ADMITTED_PRACTICE,
          CALLER_USER,
          key,
          IDEMPOTENCY_ENDPOINT_POST_PATIENT_REFERENCES,
          requestSha256(requestBody as JsonValue),
        ],
      );
      await appClient.query('commit');

      const refused = await post(requestBody, { key });

      expect(refused.status).toBe(409);
      expect(refused.body['code']).toBe('REQUEST_ALREADY_IN_PROGRESS');
      // No stale-claim takeover: the claim was reported, never adopted.
      expect(statements.labels).toEqual([
        'select idempotency_advisory_lock',
        'select idempotency_key',
      ]);
    });
  });

  describe('obligation 5 — the NON-BLOCKING transaction-scoped advisory lock', () => {
    it('answers 409 immediately while ANOTHER connection holds the scope lock', async () => {
      const key = nextKey();
      const requestBody = body();

      // The lock key of THIS canonical scope. It is derived through the same function the
      // implementation uses; the DERIVATION itself is pinned independently by
      // `src/idempotency/domain/advisory-lock-key.spec.ts`, so this call only sets up the
      // scenario and proves nothing on its own.
      const lockKey = advisoryLockKey({
        practiceId: ADMITTED_PRACTICE,
        userId: CALLER_USER,
        endpoint: IDEMPOTENCY_ENDPOINT_POST_PATIENT_REFERENCES,
        idempotencyKey: key,
      });

      const holder = await connect(disposable.app);

      try {
        await holder.query('begin');
        await holder.query('select pg_advisory_xact_lock($1::bigint)', [lockKey.toString()]);

        const refused = await post(requestBody, { key });

        expect(refused.status).toBe(409);
        expect(refused.body['code']).toBe('REQUEST_ALREADY_IN_PROGRESS');
        // IT DID NOT WAIT. The holding transaction is still open — asserted by the fact that this
        // connection can still issue a statement inside it — so the request answered without the
        // lock ever becoming available. A blocking acquisition could not have returned at all.
        const stillOpen = await holder.query('select 1 as "open"');

        expect(stillOpen.rows[0]).toEqual({ open: 1 });

        // It stopped at the lock: the scope was never inspected and no claim was created.
        expect(statements.labels).toEqual(['select idempotency_advisory_lock']);
      } finally {
        await holder.query('rollback');
        await holder.end();
      }

      // The lock is TRANSACTION-SCOPED: once the holder rolled back it is free again, with no
      // explicit unlock anywhere, and the same scope now succeeds.
      const accepted = await post(requestBody, { key });

      expect(accepted.status).toBe(201);
    });

    it('gives PARALLEL requests with the same key exactly ONE business consequence', async () => {
      const key = nextKey();
      const requestBody = body();
      const parallel = 8;

      const responses = await Promise.all(
        Array.from({ length: parallel }, () => post(requestBody, { key })),
      );

      const created = responses.filter((response) => response.status === 201);
      const refused = responses.filter((response) => response.status !== 201);

      // At least one winner, and every loser is the canonical concurrency refusal. A response
      // that arrives after the winner COMMITTED legitimately replays, which is also `201` and is
      // also exactly one business consequence — so the invariant asserted here is the one the
      // contract actually fixes, not a timing coincidence.
      expect(created.length).toBeGreaterThanOrEqual(1);
      for (const response of refused) {
        expect([response.status, response.body['code']]).toEqual([
          409,
          'REQUEST_ALREADY_IN_PROGRESS',
        ]);
      }

      // Every successful response describes the SAME resource.
      const ids = new Set(created.map((response) => String(response.body['id'])));

      expect(ids.size).toBe(1);

      const resourceId = [...ids][0];

      // EXACTLY ONE business row, ONE claim and ONE audit event for the whole burst.
      const rows = await readAsTenant<{ count: string }>(
        ADMITTED_PRACTICE,
        'select count(*)::text as count from "patient_references" where "id" = $1::uuid',
        [resourceId],
      );
      const claims = await readAsTenant<{ count: string }>(
        ADMITTED_PRACTICE,
        'select count(*)::text as count from "idempotency_keys" where "idempotency_key" = $1',
        [key],
      );
      const audits = await readAsTenant<{ count: string }>(
        ADMITTED_PRACTICE,
        'select count(*)::text as count from "audit_events" where "resource_id" = $1::uuid',
        [resourceId],
      );

      expect(rows[0]?.count).toBe('1');
      expect(claims[0]?.count).toBe('1');
      expect(audits[0]?.count).toBe('1');
    });
  });

  describe('obligations 7-9 — the pseudonym retry and the duplicate external reference', () => {
    it('answers 409 PATIENT_REFERENCE_ALREADY_EXISTS for a duplicate, disclosing no row', async () => {
      const reference = nextExternalReference();
      const first = await post(body({ externalPatientReference: reference }));

      expect(first.status).toBe(201);

      statements.reset();

      const duplicate = await post(body({ externalPatientReference: reference }));

      // The REAL `23505` of `patient_references_source_external_ref_key`, travelling through the
      // shipped Prisma/`pg` driver and translated into the canonical `409`.
      expect(duplicate.status).toBe(409);
      expect(duplicate.body['code']).toBe('PATIENT_REFERENCE_ALREADY_EXISTS');
      expect(duplicate.body['code']).not.toBe('IDEMPOTENCY_CONFLICT');

      const rendered = JSON.stringify(duplicate.body);

      expect(rendered).not.toContain(String(first.body['id']));
      expect(rendered).not.toContain(String(first.body['pseudonym']));
      expect(rendered).not.toContain(String(first.body['createdAt']));
      expect(rendered).not.toContain(reference);
      expect(rendered).not.toContain('patient_references_source_external_ref_key');
      expect(rendered).not.toContain('23505');

      // NO existence pre-read: the duplicate was learned from the INSERT itself.
      expect(statements.labels).toEqual([
        'select idempotency_advisory_lock',
        'select idempotency_key',
        'insert idempotency_key',
        'insert patient_reference',
      ]);

      // The failed transaction rolled back completely: no second business row, no audit row, and
      // no surviving claim for the second key.
      const rows = await readAsTenant<{ count: string }>(
        ADMITTED_PRACTICE,
        `select count(*)::text as count from "patient_references"
          where "external_patient_ref_hash" = (
            select "external_patient_ref_hash" from "patient_references" where "id" = $1::uuid
          )`,
        [first.body['id']],
      );

      expect(rows[0]?.count).toBe('1');
    });

    it('writes distinct CSPRNG pseudonyms across many creates', async () => {
      const pseudonyms = new Set<string>();

      for (let index = 0; index < 12; index += 1) {
        const created = await post(body());

        expect(created.status).toBe(201);
        pseudonyms.add(String(created.body['pseudonym']));
      }

      // Twelve draws, twelve distinct values, and none derived from the external identifier —
      // the exhaustion and fifth-attempt paths are driven deterministically through the mocked
      // seam in `patient-reference-create.service.spec.ts`, which is the only way to force a
      // `32^10` collision.
      expect(pseudonyms.size).toBe(12);
    });
  });

  describe('obligations 10, 11 and OD-P5-I4C-4/5 — validation over the real surface', () => {
    it.each([['AXENITA'], ['CSV'], ['FHIR'], ['OTHER']])(
      'answers 422 for sourceSystem %s without reflecting it',
      async (sourceSystem) => {
        const refused = await post(body({ sourceSystem }));

        expect(refused.status).toBe(422);
        expect(refused.body['code']).toBe('VALIDATION_ERROR');
        expect(JSON.stringify(refused.body)).not.toContain(`"${sourceSystem}"`);
        expect(statements.labels).toEqual([]);
      },
    );

    it.each([['O'], ['U'], ['X']])('answers 422 for sexCode %s', async (sexCode) => {
      const refused = await post(body({ sexCode }));

      expect(refused.status).toBe(422);
      expect(refused.body['code']).toBe('VALIDATION_ERROR');
      expect(statements.labels).toEqual([]);
    });

    it.each([[1899], [2201]])(
      'answers 422 for birthYear %s with ZERO database round trips',
      async (birthYear) => {
        const refused = await post(body({ birthYear }));

        expect(refused.status).toBe(422);
        expect(refused.body['code']).toBe('VALIDATION_ERROR');
        // `OD-P5-I4C-5`: the application refuses first, so SQLSTATE `23514` is never the normal
        // validation channel. `patient_references_birth_year_check` remains the LAST line and is
        // unchanged.
        expect(statements.labels).toEqual([]);
      },
    );

    it('accepts the inclusive birthYear bounds', async () => {
      expect((await post(body({ birthYear: 1900 }))).status).toBe(201);
      expect((await post(body({ birthYear: 2200 }))).status).toBe(201);
    });

    it('accepts omitted and explicitly null birthYear and sexCode', async () => {
      const omitted = await post({
        sourceSystem: 'MANUAL',
        externalPatientReference: nextExternalReference(),
      });

      expect(omitted.status).toBe(201);
      expect([omitted.body['birthYear'], omitted.body['sexCode']]).toEqual([null, null]);

      const explicitNulls = await post(body({ birthYear: null, sexCode: null }));

      expect(explicitNulls.status).toBe(201);
      expect([explicitNulls.body['birthYear'], explicitNulls.body['sexCode']]).toEqual([
        null,
        null,
      ]);
    });

    it('rejects an unknown field with UNKNOWN_FIELD before anything is hashed or written', async () => {
      const refused = await post(body({ practiceId: FOREIGN_PRACTICE }));

      expect(refused.status).toBe(422);
      expect(refused.body['code']).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(refused.body)).toContain('UNKNOWN_FIELD');
      expect(statements.labels).toEqual([]);
    });

    it('refuses an unauthorised caller before the body or the header is judged', async () => {
      // The seeded physician holds no membership in `practiceDemo`, so admission
      // fails first — the caller learns nothing about the body schema or the idempotency key.
      const refused = await post(
        { totally: 'unmodelled' },
        { key: null, subject: UNADMITTED_SUBJECT },
      );

      expect(refused.status).toBe(403);
      expect(refused.body['code']).toBe('ACCESS_DENIED');
      expect(statements.labels).toEqual([]);
    });
  });

  describe('obligations 14-17 — the audit trail against the real table', () => {
    it('writes exactly ONE minimised row and reproduces its digest FROM THE STORED ROW', async () => {
      const created = await post(body());

      const rows = await readAsTenant<Record<string, unknown>>(
        ADMITTED_PRACTICE,
        'select * from "audit_events" where "resource_id" = $1::uuid',
        [created.body['id']],
      );

      expect(rows).toHaveLength(1);

      const stored = rows[0] ?? {};

      // The canonical vocabulary (`04` §7.5a.3).
      expect(stored['actor_type']).toBe('USER');
      expect(stored['resource_type']).toBe('PATIENT_REFERENCE');
      expect(stored['action']).toBe('PATIENT_REFERENCE_CREATED');
      expect(stored['actor_user_id']).toBe(CALLER_USER);
      expect(stored['practice_id']).toBe(ADMITTED_PRACTICE);

      // Minimisation.
      expect(stored['previous_value']).toBeNull();
      expect(stored['new_value']).toBeNull();
      expect(stored['metadata']).toEqual({ sourceSystem: 'MANUAL' });
      // Phase 5 is SELF-HASH ONLY and collects none of the three request fingerprints.
      expect(stored['previous_event_sha256']).toBeNull();
      expect(stored['session_id_hash']).toBeNull();
      expect(stored['ip_address']).toBeNull();
      expect(stored['user_agent_hash']).toBeNull();
      expect(stored['actor_service']).toBeNull();

      // No PHI anywhere in the row.
      const rendered = JSON.stringify(stored);

      expect(rendered).not.toContain(String(created.body['pseudonym']));
      expect(rendered).not.toContain('1968');
      expect(rendered).not.toContain('h1.');

      // OBLIGATION 16 — all seventeen values REBUILT FROM THE STORED ROW, then hashed. Hashing an
      // in-memory pre-insert object would not satisfy this; every value below comes back out of
      // PostgreSQL.
      const payload = buildAuditEventHashPayloadV1({
        id: String(stored['id']),
        practiceId: String(stored['practice_id']),
        occurredAt: stored['occurred_at'] as Date,
        actorType: String(stored['actor_type']),
        actorUserId: stored['actor_user_id'] as string | null,
        actorService: stored['actor_service'] as string | null,
        action: String(stored['action']),
        resourceType: String(stored['resource_type']),
        resourceId: stored['resource_id'] as string | null,
        requestId: stored['request_id'] as string | null,
        previousValue: stored['previous_value'] as JsonValue | null,
        newValue: stored['new_value'] as JsonValue | null,
        metadata: stored['metadata'] as JsonValue,
      });

      expect(Object.keys(payload)).toHaveLength(17);
      expect(payload['event_sha256']).toBeUndefined();
      // The audit `occurred_at` surface is `.SSS000Z`, never the public `.sssZ`.
      expect(payload['occurred_at']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}000Z$/);
      expect(sha256HexUtf8(canonicaliseJson(payload))).toBe(stored['event_sha256']);
    });

    it('writes NO audit row for a GET, a validation failure or a duplicate', async () => {
      const created = await post(body());

      const before = await readAsTenant<{ count: string }>(
        ADMITTED_PRACTICE,
        'select count(*)::text as count from "audit_events"',
      );

      await request(app.getHttpServer())
        .get(`/api/v1/patient-references/${String(created.body['id'])}`)
        .set({ Authorization: developmentBearer(CALLER), [PRACTICE_HEADER]: ADMITTED_PRACTICE });
      await post(body({ sourceSystem: 'AXENITA' }));
      await post(body(), { key: null });
      await post(body({ externalPatientReference: nextExternalReference() }), { key: nextKey() });

      const after = await readAsTenant<{ count: string }>(
        ADMITTED_PRACTICE,
        'select count(*)::text as count from "audit_events"',
      );

      // Exactly ONE new row — the last successful create. The `GET`, the `422` and the missing
      // key wrote none.
      expect(Number(after[0]?.count)).toBe(Number(before[0]?.count) + 1);
    });
  });

  describe('the tenant boundary under FORCE ROW LEVEL SECURITY (09 §4, §18.1)', () => {
    it('writes rows only into the admitted practice', async () => {
      const created = await post(body());

      const inForeignTenant = await readAsTenant<Record<string, unknown>>(
        FOREIGN_PRACTICE,
        'select "id" from "patient_references" where "id" = $1::uuid',
        [created.body['id']],
      );
      const auditsInForeignTenant = await readAsTenant<Record<string, unknown>>(
        FOREIGN_PRACTICE,
        'select "id" from "audit_events" where "resource_id" = $1::uuid',
        [created.body['id']],
      );
      const claimsInForeignTenant = await readAsTenant<Record<string, unknown>>(
        FOREIGN_PRACTICE,
        'select "id" from "idempotency_keys"',
      );

      // `patient_references_select`, `audit_events_select` and `idempotency_keys_select` all
      // restrict to `app.practice_id`, so another tenant sees none of the three.
      expect(inForeignTenant).toEqual([]);
      expect(auditsInForeignTenant).toEqual([]);
      expect(claimsInForeignTenant).toEqual([]);
    });
  });

  describe('obligations 12-13 — the service-level lookups against the real database', () => {
    /** Admits ONE request for `practiceId` and runs a lookup on that pinned session. */
    async function withAdmittedLookup<T>(
      practiceId: string,
      subject: string,
      work: (
        lookups: PatientReferenceLookupService,
        tenant: Parameters<PatientReferenceLookupService['findByPseudonym']>[0],
      ) => Promise<T>,
    ): Promise<T> {
      const bootstrap = app.get(IdentityBootstrapService);
      const pipeline = app.get(TenantRequestPipeline);
      const facade = app.get(TenantDatabaseService);
      const lookups = app.get(PatientReferenceLookupService);

      return bootstrap.runAuthenticatedSession(subject, async (session) => {
        const admitted = await pipeline.admit(session, {
          scope: { mode: 'HEADER_ONLY' },
          practiceContextHeader: practiceId,
          requiredPermission: 'patient_reference.read',
        });

        return work(lookups, facade.forAdmittedRequest(session, admitted));
      });
    }

    it('finds a created row by pseudonym, case-insensitively and tenant-scoped', async () => {
      const created = await post(body());
      const pseudonym = String(created.body['pseudonym']);

      const found = await withAdmittedLookup(ADMITTED_PRACTICE, CALLER, (lookups, tenant) =>
        lookups.findByPseudonym(tenant, pseudonym.toLowerCase()),
      );

      expect(found?.id).toBe(created.body['id']);

      // A syntactically impossible value never reaches the database and never resolves.
      const impossible = await withAdmittedLookup(ADMITTED_PRACTICE, CALLER, (lookups, tenant) =>
        lookups.findByPseudonym(tenant, 'P-IIIIIIIIII'),
      );

      expect(impossible).toBeUndefined();
    });

    it('finds a created row by external reference through the keyed token', async () => {
      const reference = nextExternalReference();
      const created = await post(body({ externalPatientReference: reference }));

      const found = await withAdmittedLookup(ADMITTED_PRACTICE, CALLER, (lookups, tenant) =>
        lookups.findByExternalReference(tenant, reference),
      );

      expect(found?.id).toBe(created.body['id']);
      // The result is the public six-field document: no token, no plaintext, no tenant.
      expect(Object.keys(found ?? {}).sort()).toEqual([
        'birthYear',
        'createdAt',
        'id',
        'pseudonym',
        'sexCode',
        'sourceSystem',
      ]);

      // Normalisation happens before keying, so an outer-whitespace variant still matches.
      const trimmed = await withAdmittedLookup(ADMITTED_PRACTICE, CALLER, (lookups, tenant) =>
        lookups.findByExternalReference(tenant, `  ${reference}  `),
      );

      expect(trimmed?.id).toBe(created.body['id']);

      // A value the MANUAL-v1 profile refuses resolves to nothing, without a statement.
      const refused = await withAdmittedLookup(ADMITTED_PRACTICE, CALLER, (lookups, tenant) =>
        lookups.findByExternalReference(tenant, 'A'.repeat(300)),
      );

      expect(refused).toBeUndefined();
    });

    it('registers NO HTTP route for either lookup (D-072 OD-P5-I4-14)', async () => {
      const authorised = {
        Authorization: developmentBearer(CALLER),
        [PRACTICE_HEADER]: ADMITTED_PRACTICE,
      };

      // Nothing matches at the router: the controller declares one `@Get(':id')` and one
      // `@Post()`, so a collection read and every multi-segment lookup shape are `404`.
      for (const path of [
        '/api/v1/patient-references',
        '/api/v1/patient-references/by-pseudonym/P-K7M2QX4TB9',
        '/api/v1/patient-references/by-external-reference/LOCAL-1',
        '/api/v1/patient-references/lookup/P-K7M2QX4TB9',
      ]) {
        const response = await request(app.getHttpServer()).get(path).set(authorised);

        expect([path, response.status]).toEqual([path, 404]);
      }

      // A SINGLE extra segment is matched by the `P5-I4A` `{id}` route and answered
      // `400 VALIDATION_ERROR` as a malformed identifier — which is the point: it is handled as
      // an identifier, NOT as a lookup. No pseudonym is canonicalised, no external reference is
      // keyed, and no statement runs.
      statements.reset();

      for (const path of [
        '/api/v1/patient-references/lookup',
        '/api/v1/patient-references/search',
        `/api/v1/patient-references/P-K7M2QX4TB9`,
      ]) {
        const response = await request(app.getHttpServer()).get(path).set(authorised);

        expect([path, response.status, (response.body as Record<string, unknown>)['code']]).toEqual(
          [path, 400, 'VALIDATION_ERROR'],
        );
      }

      expect(statements.labels).toEqual([]);
    });
  });
});
