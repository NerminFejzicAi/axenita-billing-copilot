import { createHash, randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import { type Client } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  PHASE_3_SEED_IDS,
  PHASE_3_SEED_SUBJECTS,
  runInForceRlsMaintenanceWindow,
  runPhase3Seed,
} from '../prisma/seed.js';
import { buildAuditEventHashPayloadV1 } from '../src/crypto/audit-event-hash-payload.js';
import { canonicaliseJson, type JsonValue } from '../src/crypto/json-canonicalizer.js';
import { sha256HexUtf8 } from '../src/crypto/sha256-utf8.js';
import { type TenantStatement } from '../src/database/tenant-statement.js';
import {
  IDENTITY_DATABASE,
  type IdentityBootstrapSession,
  type IdentityDatabase,
} from '../src/identity/infrastructure/identity-database.port.js';
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
import { readProblemDetails } from './support/read-problem-details.js';
import { runPrismaCli } from './support/run-prisma-cli.js';

/**
 * `P5-I5C` — `PATCH /api/v1/encounters/{encounterId}` against the REAL migrated schema, the REAL
 * runtime role `copilot_app` (NOBYPASSRLS, owner of nothing) and the REAL HTTP pipeline.
 *
 * Normative sources: `03` §12 (the D-087 current contract), §8.1 (its additive reconciliation);
 * `08` §12.13; D-087 `OD-P5-I5C-1` … `OD-P5-I5C-8`, `RULING J` (minimum evidence).
 *
 * It runs on its OWN guarded disposable database, migrated with `prisma migrate deploy` and seeded
 * with the phase 3 seed, exactly like the `P5-I5B` proof, and drops it afterwards. No schema,
 * migration, grant or policy is changed: the existing twelve-column `UPDATE` grant and the
 * `encounters_update` policy of package `013` are used AS-IS, and this file proves it.
 *
 * `phase5-responsible-physician-ri.security.ts` is NOT touched.
 */

const PRACTICE_HEADER = 'X-Practice-ID';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const IF_MATCH_HEADER = 'If-Match';
const REQUEST_ID_HEADER = 'X-Request-ID';

/** The admitted practice and caller: `PRACTICE_ADMIN` + `PHYSICIAN` in demo -> `encounter.update`. */
const ADMITTED_PRACTICE = PHASE_3_SEED_IDS.practiceDemo;
const FOREIGN_PRACTICE = PHASE_3_SEED_IDS.practiceNord;
const CALLER = PHASE_3_SEED_SUBJECTS.practiceAdmin;
const CALLER_USER = PHASE_3_SEED_IDS.userPracticeAdmin;

/** A DIFFERENT same-practice member: `MPA` only, `users.status = INACTIVE`, membership active. */
const CO_MEMBER = PHASE_3_SEED_IDS.userInactive;

/** A real user whose ONLY membership is in ANOTHER practice. */
const FOREIGN_ONLY_MEMBER = PHASE_3_SEED_IDS.userPhysician;

/** A real user with NO membership anywhere — created by this file in `beforeAll`. */
const NON_MEMBER_USER = '22222222-2222-4222-8222-2222222250c1';

/** Subject of a caller without `encounter.update` in demo (member of nord only, zero roles). */
const UNADMITTED_SUBJECT = PHASE_3_SEED_SUBJECTS.physician;

const CLOSED_DOCUMENT_KEYS = [
  'createdAt',
  'id',
  'occurredAt',
  'patient',
  'status',
  'treatmentDate',
  'version',
];

/** The twelve `UPDATE`-granted `encounters` columns of package `013`, unchanged. */
const GRANTED_UPDATE_COLUMNS = [
  'occurred_at',
  'patient_age_at_encounter',
  'patient_sex_at_encounter',
  'guarantor_type',
  'insurance_context',
  'responsible_physician_id',
  'specialty_code',
  'status',
  'treatment_date',
  'updated_at',
  'updated_by',
  'version',
].sort();

let keySequence = 0;

function nextKey(): string {
  keySequence += 1;

  return `p5i5c-sec-${String(keySequence).padStart(4, '0')}`;
}

interface StatementObserver {
  readonly labels: readonly string[];
  reset(): void;
  /** Makes the NEXT statement carrying `label` throw before it reaches the database. */
  failNext(label: string): void;
}

/** Records every FEATURE statement label run on the pinned session, and can inject one failure. */
function observeTenantStatements(application: NestExpressApplication): StatementObserver {
  const database = application.get<IdentityDatabase>(IDENTITY_DATABASE);
  const labels: string[] = [];
  let failing: string | undefined;
  const runBootstrapTransaction = database.runBootstrapTransaction.bind(database);

  database.runBootstrapTransaction = async <T>(
    work: (session: IdentityBootstrapSession) => Promise<T>,
  ): Promise<T> =>
    runBootstrapTransaction(async (session) => {
      const observed: IdentityBootstrapSession = Object.create(session) as IdentityBootstrapSession;

      Object.defineProperty(observed, 'runTenantStatement', {
        value: async <TRow>(statement: TenantStatement): Promise<readonly TRow[]> => {
          labels.push(statement.label);

          if (failing === statement.label) {
            failing = undefined;
            throw new Error('Injected statement failure (test only).');
          }

          return session.runTenantStatement<TRow>(statement);
        },
      });

      return work(observed);
    });

  return {
    labels,
    reset: (): void => {
      labels.length = 0;
      failing = undefined;
    },
    failNext: (label: string): void => {
      failing = label;
    },
  };
}

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly headers: Record<string, string>;
}

describe('PATCH /api/v1/encounters/{encounterId} (P5-I5C)', () => {
  let disposable: DisposableDatabase;
  let app: NestExpressApplication;
  let appClient: Client;
  let statements: StatementObserver;
  let logger: CapturingLogger;

  let patientId: string;
  let patientPseudonym: string;
  let foreignPatientId: string;

  beforeAll(async () => {
    disposable = await createDisposableDatabase(generateDisposableDatabaseName());

    expect(disposable.name).toMatch(/^copilot_gate3b_/);
    for (const url of [disposable.app, disposable.migration]) {
      expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname);
      expect(new URL(url).pathname).toBe(`/${disposable.name}`);
    }

    runPrismaCli(['migrate', 'deploy'], disposable.migration);
    await runPhase3Seed(disposable.migration);

    const migrator = await connect(disposable.migration);

    try {
      await runInForceRlsMaintenanceWindow(migrator, 'users', async (client) => {
        await client.query(
          `insert into "users" (
             "id", "auth_subject", "email", "display_name", "preferred_language",
             "status", "last_login_at", "created_at", "updated_at"
           )
           values ($1, 'dev|p5i5c-non-member', 'p5i5c-non-member@example.invalid',
                   'P5-I5C non-member', 'de-CH', 'ACTIVE'::entity_status, null,
                   current_timestamp, current_timestamp)`,
          [NON_MEMBER_USER],
        );
      });
    } finally {
      await migrator.end();
    }

    appClient = await connect(disposable.app);
    logger = new CapturingLogger();
    app = await createIdentityTestApplication(disposable, logger);
    statements = observeTenantStatements(app);

    const patient = await request(app.getHttpServer())
      .post('/api/v1/patient-references')
      .set({
        Authorization: developmentBearer(CALLER),
        [PRACTICE_HEADER]: ADMITTED_PRACTICE,
        [IDEMPOTENCY_HEADER]: 'p5i5c-sec-patient',
      })
      .send({ sourceSystem: 'MANUAL', externalPatientReference: 'LOCAL-P5I5C-SEC-PATIENT' });

    expect(patient.status).toBe(201);
    patientId = String((patient.body as Record<string, unknown>)['id']);
    patientPseudonym = String((patient.body as Record<string, unknown>)['pseudonym']);

    foreignPatientId = randomUUID();
    await asTenant(FOREIGN_PRACTICE, async () => {
      await appClient.query(
        `insert into "patient_references"
           ("id", "practice_id", "source_system", "external_patient_ref_hash", "pseudonym",
            "created_at", "updated_at")
         values ($1::uuid, $2::uuid, 'MANUAL'::integration_provider, $3, 'P-NRDP5I5C00',
                 current_timestamp, current_timestamp)`,
        [
          foreignPatientId,
          FOREIGN_PRACTICE,
          `h1.${createHash('sha256').update('p5i5c-foreign').digest('hex')}`,
        ],
      );
    });
    statements.reset();
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

  /** Runs `work` as `copilot_app` in one practice's tenant context, and COMMITS it. */
  async function asTenant<T>(practiceId: string, work: () => Promise<T>): Promise<T> {
    await appClient.query('begin');

    try {
      await appClient.query('select set_config($1, $2, true)', ['app.practice_id', practiceId]);
      const result = await work();
      await appClient.query('commit');

      return result;
    } catch (error) {
      await appClient.query('rollback');
      throw error;
    }
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

  function createBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      patientReferenceId: patientId,
      occurredAt: '2026-07-17T08:30:00+02:00',
      treatmentDate: '2026-07-17',
      responsiblePhysicianId: CALLER_USER,
      guarantorType: 'KVG',
      insuranceContext: 'AMBULATORY',
      specialtyCode: 'AIM',
      patientAgeAtEncounter: 58,
      patientSexAtEncounter: 'F',
      sourceSystem: 'MANUAL',
      diagnoses: [{ codingSystem: 'ICD-10', code: 'I10', isPrimary: true }],
      ...overrides,
    };
  }

  async function post(requestBody: unknown, key = nextKey()): Promise<Answer> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/encounters')
      .set({
        Authorization: developmentBearer(CALLER),
        [PRACTICE_HEADER]: ADMITTED_PRACTICE,
        [IDEMPOTENCY_HEADER]: key,
      })
      .send(requestBody as object);

    return {
      status: response.status,
      body: response.body as Record<string, unknown>,
      headers: response.headers,
    };
  }

  /** Creates a fresh DRAFT encounter at version 1 and clears the statement log. */
  async function createEncounter(overrides: Record<string, unknown> = {}): Promise<string> {
    const created = await post(createBody(overrides));

    expect(created.status).toBe(201);
    statements.reset();

    return String(created.body['id']);
  }

  /** One `PATCH`. `ifMatch: null` sends no `If-Match`; `header: null` sends no practice. */
  async function patch(
    encounterId: string,
    requestBody: unknown,
    options: {
      ifMatch?: string | null;
      header?: string | null;
      subject?: string;
      requestId?: string;
      idempotencyKey?: string;
    } = {},
  ): Promise<Answer> {
    const headers: Record<string, string> = {
      Authorization: developmentBearer(options.subject ?? CALLER),
    };
    const header = options.header === undefined ? ADMITTED_PRACTICE : options.header;
    const ifMatch = options.ifMatch === undefined ? '"1"' : options.ifMatch;

    if (header !== null) {
      headers[PRACTICE_HEADER] = header;
    }

    if (ifMatch !== null) {
      headers[IF_MATCH_HEADER] = ifMatch;
    }

    if (options.requestId !== undefined) {
      headers[REQUEST_ID_HEADER] = options.requestId;
    }

    if (options.idempotencyKey !== undefined) {
      headers[IDEMPOTENCY_HEADER] = options.idempotencyKey;
    }

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/encounters/${encounterId}`)
      .set(headers)
      .send(requestBody as object);

    return {
      status: response.status,
      body: response.body as Record<string, unknown>,
      headers: response.headers,
    };
  }

  async function storedRow(
    encounterId: string,
    practiceId: string = ADMITTED_PRACTICE,
  ): Promise<Record<string, unknown>> {
    const rows = await readAsTenant<Record<string, unknown>>(
      practiceId,
      `select *, "status"::text as "status_text",
              to_char("treatment_date", 'YYYY-MM-DD') as "treatment_date_text"
         from "encounters" where "id" = $1::uuid`,
      [encounterId],
    );

    expect(rows).toHaveLength(1);

    return rows[0] ?? {};
  }

  async function updateAudits(encounterId: string): Promise<Record<string, unknown>[]> {
    return readAsTenant<Record<string, unknown>>(
      ADMITTED_PRACTICE,
      `select * from "audit_events"
        where "resource_id" = $1::uuid and "action" = 'ENCOUNTER_UPDATED'
        order by "occurred_at"`,
      [encounterId],
    );
  }

  /**
   * The DATABASE clock. `updated_at` of a PATCH is a database instant (owner adjudication N-3),
   * while `created_at` of the create path is an APPLICATION instant (`P5-I5B`); the two clocks
   * may differ (an empirically observed host/container skew of ~0.7 s on this machine), so
   * `updated_at` is only ever compared with other database instants.
   */
  async function databaseClock(): Promise<number> {
    const rows = await readAsTenant<{ now: Date }>(
      ADMITTED_PRACTICE,
      'select clock_timestamp() as "now"',
    );

    return (rows[0]?.now ?? new Date(Number.NaN)).getTime();
  }

  async function setStatus(encounterId: string, status: string): Promise<void> {
    await asTenant(ADMITTED_PRACTICE, async () => {
      await appClient.query(
        'update "encounters" set "status" = $2::encounter_status where "id" = $1::uuid',
        [encounterId, status],
      );
    });
  }

  function stable(problem: Record<string, unknown>): Record<string, unknown> {
    const { requestId: _requestId, instance: _instance, ...rest } = problem;

    return rest;
  }

  // ---------------------------------------------------------------------------------------------

  describe('the successful PATCH (OD-P5-I5C-4, -8)', () => {
    it('returns 200, the NEW version, ETag == body version and EXACTLY the closed document', async () => {
      const id = await createEncounter();

      const answer = await patch(
        id,
        { occurredAt: '2026-07-18T10:15:30.250+02:00', treatmentDate: '2026-07-18' },
        { ifMatch: '"1"' },
      );

      expect(answer.status).toBe(200);
      expect(answer.headers['content-type']).toContain('application/json');
      expect(answer.headers['etag']).toBe('"2"');
      expect(answer.headers['etag']).toBe(`"${String(answer.body['version'])}"`);
      expect(Object.keys(answer.body).sort()).toStrictEqual(CLOSED_DOCUMENT_KEYS);
      expect(Object.keys(answer.body['patient'] as object).sort()).toStrictEqual([
        'id',
        'pseudonym',
      ]);
      expect(answer.body).toMatchObject({
        id,
        status: 'DRAFT',
        version: 2,
        patient: { id: patientId, pseudonym: patientPseudonym },
        occurredAt: '2026-07-18T08:15:30.250Z',
        treatmentDate: '2026-07-18',
      });
    });

    it('runs EXACTLY one encounter statement and the audit insert — no pre-read, no post-read', async () => {
      const id = await createEncounter();

      expect((await patch(id, { specialtyCode: 'KAR' })).status).toBe(200);
      expect(statements.labels).toStrictEqual(['update encounter', 'insert audit_event']);
    });

    it('increments version and ETag on every success, and writes updated_by / updated_at', async () => {
      const id = await createEncounter();
      const before = await storedRow(id);

      const clockBefore = await databaseClock();
      const first = await patch(id, { specialtyCode: 'KAR' }, { ifMatch: '"1"' });
      const afterFirst = await storedRow(id);
      const second = await patch(id, { specialtyCode: 'NEU' }, { ifMatch: '"2"' });
      const afterSecond = await storedRow(id);

      expect([first.status, first.headers['etag'], first.body['version']]).toStrictEqual([
        200,
        '"2"',
        2,
      ]);
      expect([second.status, second.headers['etag'], second.body['version']]).toStrictEqual([
        200,
        '"3"',
        3,
      ]);
      expect(before).toMatchObject({ version: 1, updated_by: null });
      expect(afterFirst).toMatchObject({
        version: 2,
        updated_by: CALLER_USER,
        specialty_code: 'KAR',
      });
      expect(afterSecond).toMatchObject({
        version: 3,
        updated_by: CALLER_USER,
        specialty_code: 'NEU',
      });
      expect((afterFirst['updated_at'] as Date).getTime()).toBeGreaterThanOrEqual(clockBefore);
      expect((afterSecond['updated_at'] as Date).getTime()).toBeGreaterThan(
        (afterFirst['updated_at'] as Date).getTime(),
      );
      // Nothing outside the PATCH surface moved.
      for (const row of [afterFirst, afterSecond]) {
        expect(row).toMatchObject({
          practice_id: ADMITTED_PRACTICE,
          patient_reference_id: patientId,
          status_text: 'DRAFT',
          source_system: 'MANUAL',
          created_by: CALLER_USER,
        });
        expect((row['created_at'] as Date).getTime()).toBe(
          (before['created_at'] as Date).getTime(),
        );
      }
    });

    it('writes updated_at from the DATABASE clock_timestamp(), not the transaction start (N-3)', async () => {
      const id = await createEncounter();

      // The SQL itself (`"updated_at" = clock_timestamp()`, and no `now()` / `current_timestamp`)
      // is pinned by the adapter spec. Here: the stored value lies inside a bracket read from the
      // DATABASE clock immediately before and after the request.
      const clockBefore = await databaseClock();
      expect((await patch(id, { specialtyCode: 'KAR' })).status).toBe(200);
      const clockAfter = await databaseClock();

      const updatedAt = ((await storedRow(id))['updated_at'] as Date).getTime();

      expect(updatedAt).toBeGreaterThanOrEqual(clockBefore);
      expect(updatedAt).toBeLessThanOrEqual(clockAfter);
    });

    it('applies PATCH in READY_FOR_ANALYSIS as well as DRAFT, and never changes status', async () => {
      const id = await createEncounter();
      await setStatus(id, 'READY_FOR_ANALYSIS');

      const answer = await patch(id, { guarantorType: 'UVG' });

      expect(answer.status).toBe(200);
      expect(answer.body['status']).toBe('READY_FOR_ANALYSIS');
      expect(await storedRow(id)).toMatchObject({ status_text: 'READY_FOR_ANALYSIS', version: 2 });
    });

    it('ignores a stray Idempotency-Key — no claim row, no idempotency statement', async () => {
      const id = await createEncounter();
      const key = nextKey();

      expect((await patch(id, { specialtyCode: 'KAR' }, { idempotencyKey: key })).status).toBe(200);
      expect(statements.labels.some((label) => label.includes('idempotency'))).toBe(false);
      expect(
        await readAsTenant(
          ADMITTED_PRACTICE,
          'select 1 from "idempotency_keys" where "idempotency_key" = $1',
          [key],
        ),
      ).toStrictEqual([]);
    });
  });

  describe('optimistic concurrency and the status guard (OD-P5-I5C-2)', () => {
    it('answers ONE byte-identical 409 VERSION_CONFLICT for stale, nonexistent and cross-tenant — never 404', async () => {
      const id = await createEncounter();
      expect((await patch(id, { specialtyCode: 'KAR' }, { ifMatch: '"1"' })).status).toBe(200);
      statements.reset();

      // A FOREIGN encounter at version 1, committed under the foreign practice's own context.
      const foreignId = randomUUID();
      await asTenant(FOREIGN_PRACTICE, async () => {
        await appClient.query(
          `insert into "encounters"
             ("id", "practice_id", "patient_reference_id", "occurred_at", "treatment_date",
              "status", "source_system", "version", "created_by", "created_at", "updated_at")
           values ($1::uuid, $2::uuid, $3::uuid, current_timestamp, current_date,
                   'DRAFT'::encounter_status, 'MANUAL'::integration_provider, 1, $4::uuid,
                   current_timestamp, current_timestamp)`,
          [foreignId, FOREIGN_PRACTICE, foreignPatientId, FOREIGN_ONLY_MEMBER],
        );
      });
      const foreignBefore = await storedRow(foreignId, FOREIGN_PRACTICE);

      const stale = await patch(id, { specialtyCode: 'NEU' }, { ifMatch: '"1"' });
      const missing = await patch(randomUUID(), { specialtyCode: 'NEU' }, { ifMatch: '"1"' });
      const foreign = await patch(foreignId, { specialtyCode: 'NEU' }, { ifMatch: '"1"' });

      for (const answer of [stale, missing, foreign]) {
        expect(answer.status).toBe(409);
        expect(answer.headers['content-type']).toContain('application/problem+json');
        expect(answer.body['code']).toBe('VERSION_CONFLICT');
        expect(answer.headers['etag'] ?? '').not.toMatch(/^"\d+"$/);
      }

      expect(stable(missing.body)).toStrictEqual(stable(stale.body));
      expect(stable(foreign.body)).toStrictEqual(stable(stale.body));
      // `instance` is the frozen RFC 9457 echo of the caller's own request line (`03` §8; the
      // D-073 precedent) and is excluded; no member the route AUTHORS carries the identifier.
      expect(JSON.stringify(stable(foreign.body))).not.toContain(foreignId);
      expect(statements.labels).toStrictEqual([
        'update encounter',
        'update encounter',
        'update encounter',
      ]);
      expect(await storedRow(id)).toMatchObject({ version: 2, specialty_code: 'KAR' });
      expect(await storedRow(foreignId, FOREIGN_PRACTICE)).toStrictEqual(foreignBefore);
    });

    it.each(['CANCELLED', 'CLOSED'])(
      'answers %s: stale -> VERSION_CONFLICT; matching version -> INVALID_STATE_TRANSITION; nothing written',
      async (status) => {
        const id = await createEncounter();
        await setStatus(id, status);
        const before = await storedRow(id);

        const stale = await patch(id, { specialtyCode: 'KAR' }, { ifMatch: '"7"' });
        const matching = await patch(id, { specialtyCode: 'KAR' }, { ifMatch: '"1"' });

        expect([stale.status, stale.body['code']]).toStrictEqual([409, 'VERSION_CONFLICT']);
        expect([matching.status, matching.body['code']]).toStrictEqual([
          409,
          'INVALID_STATE_TRANSITION',
        ]);
        expect(await storedRow(id)).toStrictEqual(before);
        expect(await updateAudits(id)).toStrictEqual([]);
      },
    );

    it('★ REAL two-connection race: two PATCHes at the same version -> exactly ONE 200 and ONE 409', async () => {
      const id = await createEncounter();
      const holder = await connect(disposable.app);

      try {
        // A third connection holds the row lock, so BOTH requests are provably inside their own
        // transactions, blocked on the SAME row, before either can proceed.
        await holder.query('begin');
        await holder.query('select set_config($1, $2, true)', [
          'app.practice_id',
          ADMITTED_PRACTICE,
        ]);
        await holder.query('select 1 from "encounters" where "id" = $1::uuid for update', [id]);

        const racing = Promise.all([
          patch(id, { specialtyCode: 'RACE-A' }, { ifMatch: '"1"' }),
          patch(id, { specialtyCode: 'RACE-B' }, { ifMatch: '"1"' }),
        ]);

        const deadline = Date.now() + 15000;
        let waiting = 0;

        while (waiting < 2 && Date.now() < deadline) {
          const result = await appClient.query<{ waiting: string }>(
            `select count(*)::text as "waiting" from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock'`,
          );
          waiting = Number(result.rows[0]?.waiting ?? '0');

          if (waiting < 2) {
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        }

        expect(waiting).toBe(2);
        await holder.query('rollback');

        const answers = await racing;
        const outcomes = answers.map((answer) => [answer.status, answer.body['code'] ?? null]);

        expect(outcomes.filter(([status]) => status === 200)).toHaveLength(1);
        expect(outcomes.filter(([status]) => status === 409)).toStrictEqual([
          [409, 'VERSION_CONFLICT'],
        ]);
      } finally {
        await holder.query('rollback').catch(() => undefined);
        await holder.end();
      }

      const row = await storedRow(id);
      expect(row['version']).toBe(2);
      expect(['RACE-A', 'RACE-B']).toContain(row['specialty_code']);
      expect(await updateAudits(id)).toHaveLength(1);
    });

    it('re-evaluates against the LATEST committed row: a commit that bumps version while waiting makes the request stale', async () => {
      const id = await createEncounter();
      const holder = await connect(disposable.app);

      try {
        await holder.query('begin');
        await holder.query('select set_config($1, $2, true)', [
          'app.practice_id',
          ADMITTED_PRACTICE,
        ]);
        await holder.query(
          `update "encounters" set "version" = "version" + 1, "guarantor_type" = 'HOLDER'
            where "id" = $1::uuid`,
          [id],
        );

        const pending = patch(id, { specialtyCode: 'LATE' }, { ifMatch: '"1"' });

        const deadline = Date.now() + 15000;
        let waiting = 0;
        while (waiting < 1 && Date.now() < deadline) {
          const result = await appClient.query<{ waiting: string }>(
            `select count(*)::text as "waiting" from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock'`,
          );
          waiting = Number(result.rows[0]?.waiting ?? '0');
          if (waiting < 1) {
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        }
        expect(waiting).toBe(1);

        await holder.query('commit');

        const answer = await pending;
        expect([answer.status, answer.body['code']]).toStrictEqual([409, 'VERSION_CONFLICT']);
      } finally {
        await holder.query('rollback').catch(() => undefined);
        await holder.end();
      }

      expect(await storedRow(id)).toMatchObject({
        version: 2,
        guarantor_type: 'HOLDER',
        specialty_code: 'AIM',
      });
      expect(await updateAudits(id)).toStrictEqual([]);
    });
  });

  describe('request order: admission -> encounterId -> If-Match -> body (OD-P5-I5C-6, -7)', () => {
    it('refuses an unauthorised caller 403 before the id, If-Match or body is judged', async () => {
      const answer = await patch('not-a-uuid', [], { subject: UNADMITTED_SUBJECT, ifMatch: null });

      expect([answer.status, answer.body['code']]).toStrictEqual([403, 'ACCESS_DENIED']);
      expect(statements.labels).toStrictEqual([]);
    });

    it('answers a malformed encounterId 400 with no statement and no echo, even without If-Match', async () => {
      const answer = await patch('MALFORMED-ID-MARKER', { status: 'X' }, { ifMatch: null });

      expect(answer.status).toBe(400);
      expect(answer.body['code']).toBe('VALIDATION_ERROR');
      expect(answer.body).not.toHaveProperty('errors');
      // No member the route AUTHORS reflects the identifier (`instance` is the request-line echo of
      // `03` §8, excluded exactly as in the D-073 patient-reference precedent).
      expect(JSON.stringify(stable(answer.body))).not.toContain('MALFORMED-ID-MARKER');
      expect(answer.body['detail']).toBe('The requested resource identifier is not valid.');
      expect(logger.output).not.toContain('MALFORMED-ID-MARKER');
      expect(statements.labels).toStrictEqual([]);
    });

    it('answers a missing If-Match 428 PRECONDITION_REQUIRED before the body is judged', async () => {
      const id = await createEncounter();

      const answer = await patch(id, { status: 'CANCELLED' }, { ifMatch: null });

      expect([answer.status, answer.body['code']]).toStrictEqual([428, 'PRECONDITION_REQUIRED']);
      expect(statements.labels).toStrictEqual([]);
    });

    it.each([
      ['empty', ''],
      ['unquoted', '1'],
      ['weak', 'W/"1"'],
      ['wildcard', '*'],
      ['leading zero', '"01"'],
      ['above int4', '"2147483648"'],
    ])(
      'answers a %s If-Match 400 VALIDATION_ERROR before the body is judged',
      async (_n, value) => {
        const id = await createEncounter();

        const answer = await patch(id, { status: 'CANCELLED' }, { ifMatch: value });

        expect([answer.status, answer.body['code']]).toStrictEqual([400, 'VALIDATION_ERROR']);
        expect(statements.labels).toStrictEqual([]);
        expect(await storedRow(id)).toMatchObject({ version: 1 });
      },
    );

    it('accepts If-Match "0" syntactically and answers 409 VERSION_CONFLICT', async () => {
      const id = await createEncounter();

      const answer = await patch(id, { specialtyCode: 'KAR' }, { ifMatch: '"0"' });

      expect([answer.status, answer.body['code']]).toStrictEqual([409, 'VERSION_CONFLICT']);
      expect(statements.labels).toStrictEqual(['update encounter']);
    });
  });

  describe('body validation (OD-P5-I5C-5)', () => {
    it('answers {} 400 VALIDATION_ERROR: no statement, no version bump, no audit', async () => {
      const id = await createEncounter();

      const answer = await patch(id, {});

      expect([answer.status, answer.body['code']]).toStrictEqual([400, 'VALIDATION_ERROR']);
      expect(answer.body).not.toHaveProperty('errors');
      expect(statements.labels).toStrictEqual([]);
      expect(await storedRow(id)).toMatchObject({ version: 1, updated_by: null });
      expect(await updateAudits(id)).toStrictEqual([]);
    });

    it('answers a non-object body 422', async () => {
      const id = await createEncounter();

      const answer = await patch(id, ['occurredAt']);

      expect([answer.status, answer.body['code']]).toStrictEqual([422, 'VALIDATION_ERROR']);
      expect(statements.labels).toStrictEqual([]);
    });

    it.each([
      'status',
      'patientReferenceId',
      'sourceSystem',
      'version',
      'id',
      'practiceId',
      'createdAt',
      'createdBy',
      'updatedAt',
      'updatedBy',
      'diagnoses',
      'reason',
      'notes',
    ])(
      'refuses the forbidden / unknown member %s with 422 UNKNOWN_FIELD and no statement',
      async (field) => {
        const id = await createEncounter();

        const answer = await patch(id, { specialtyCode: 'KAR', [field]: 'x' });

        expect(answer.status).toBe(422);
        expect(readProblemDetails(answer).errors).toStrictEqual([
          { field, code: 'UNKNOWN_FIELD', message: expect.any(String) as unknown },
        ]);
        expect(statements.labels).toStrictEqual([]);
        expect(await storedRow(id)).toMatchObject({ version: 1 });
      },
    );

    it.each([
      ['a null occurredAt', { occurredAt: null }],
      ['a null treatmentDate', { treatmentDate: null }],
      ['a zone-less occurredAt', { occurredAt: '2026-07-17T08:30:00' }],
      ['an unreal treatmentDate', { treatmentDate: '2026-02-30' }],
      ['an out-of-range age', { patientAgeAtEncounter: 131 }],
      ['a non-integer age', { patientAgeAtEncounter: 58.5 }],
      ['an empty string', { guarantorType: '' }],
      ['a leading white space', { specialtyCode: ' AIM' }],
      ['an embedded line feed', { insuranceContext: 'AMBU\nLATORY' }],
      ['a NUL', { patientSexAtEncounter: 'F\u0000' }],
      ['an over-long value', { specialtyCode: 'S'.repeat(51) }],
    ])('answers 422 for %s before any statement', async (_name, body) => {
      const id = await createEncounter();

      const answer = await patch(id, body);

      expect([answer.status, answer.body['code']]).toStrictEqual([422, 'VALIDATION_ERROR']);
      expect(statements.labels).toStrictEqual([]);
    });

    it('keeps ABSENT members unchanged and writes an explicit null as SQL NULL', async () => {
      const id = await createEncounter();
      const before = await storedRow(id);

      const answer = await patch(id, {
        guarantorType: null,
        patientAgeAtEncounter: null,
        responsiblePhysicianId: null,
      });

      expect(answer.status).toBe(200);
      const after = await storedRow(id);
      expect(after).toMatchObject({
        guarantor_type: null,
        patient_age_at_encounter: null,
        responsible_physician_id: null,
        insurance_context: before['insurance_context'],
        specialty_code: before['specialty_code'],
        patient_sex_at_encounter: before['patient_sex_at_encounter'],
        treatment_date_text: before['treatment_date_text'],
      });
      expect((after['occurred_at'] as Date).getTime()).toBe(
        (before['occurred_at'] as Date).getTime(),
      );
    });
  });

  describe('responsible physician (OD-D085-10 reused)', () => {
    it('★ accepts a DIFFERENT same-practice co-member (MPA, inactive user) and null', async () => {
      const id = await createEncounter();

      expect(
        (await patch(id, { responsiblePhysicianId: CO_MEMBER }, { ifMatch: '"1"' })).status,
      ).toBe(200);
      expect(await storedRow(id)).toMatchObject({ responsible_physician_id: CO_MEMBER });

      expect((await patch(id, { responsiblePhysicianId: null }, { ifMatch: '"2"' })).status).toBe(
        200,
      );
      expect(await storedRow(id)).toMatchObject({ responsible_physician_id: null, version: 3 });
    });

    it('answers ONE byte-identical generic 422 for a non-member, a foreign-only member and a nonexistent user', async () => {
      const id = await createEncounter();
      const before = await storedRow(id);
      const answers: Answer[] = [];

      for (const responsiblePhysicianId of [NON_MEMBER_USER, FOREIGN_ONLY_MEMBER, randomUUID()]) {
        const refused = await patch(id, { responsiblePhysicianId });

        expect(refused.status).toBe(422);
        expect(refused.headers['content-type']).toContain('application/problem+json');
        expect(JSON.stringify(refused.body)).not.toContain(responsiblePhysicianId);
        answers.push(refused);
      }

      expect(stable(answers[0]?.body ?? {})).toStrictEqual({
        type: 'https://api.example.ch/problems/validation-error',
        title: 'Validation failed',
        status: 422,
        code: 'VALIDATION_ERROR',
        detail: 'One or more fields are invalid.',
      });
      expect(stable(answers[1]?.body ?? {})).toStrictEqual(stable(answers[0]?.body ?? {}));
      expect(stable(answers[2]?.body ?? {})).toStrictEqual(stable(answers[0]?.body ?? {}));

      // Learned from the UPDATE's foreign key, never from a membership pre-read; nothing survived.
      expect(statements.labels).toStrictEqual([
        'update encounter',
        'update encounter',
        'update encounter',
      ]);
      expect(await storedRow(id)).toStrictEqual(before);
      expect(await updateAudits(id)).toStrictEqual([]);
    });

    it('refuses a malformed physician UUID at request validation, before any statement', async () => {
      const id = await createEncounter();

      const refused = await patch(id, { responsiblePhysicianId: 'not-a-uuid' });

      expect(refused.status).toBe(422);
      expect(readProblemDetails(refused).errors).toStrictEqual([
        {
          field: 'responsiblePhysicianId',
          code: 'INVALID_UUID',
          message: expect.any(String) as unknown,
        },
      ]);
      expect(statements.labels).toStrictEqual([]);
    });

    it('never lets patientReferenceId reach the database — the patient FK cannot be translated by PATCH', async () => {
      const id = await createEncounter();

      const refused = await patch(id, { patientReferenceId: foreignPatientId });

      // The field-level UNKNOWN_FIELD document, NOT the generic FK 422 and NOT a 500.
      expect(refused.status).toBe(422);
      expect(readProblemDetails(refused).errors).toStrictEqual([
        {
          field: 'patientReferenceId',
          code: 'UNKNOWN_FIELD',
          message: expect.any(String) as unknown,
        },
      ]);
      expect(statements.labels).toStrictEqual([]);
      expect(await storedRow(id)).toMatchObject({ patient_reference_id: patientId, version: 1 });
    });
  });

  describe('audit (OD-P5-I5C-3)', () => {
    it('writes ONE ENCOUNTER_UPDATED row with ONLY the changed members, and reproduces its digest FROM THE STORED ROW', async () => {
      const id = await createEncounter();
      const requestId = randomUUID();

      const answer = await patch(
        id,
        {
          // Same instant as stored, different offset: NOT a change.
          occurredAt: '2026-07-17T06:30:00Z',
          treatmentDate: '2026-07-19',
          guarantorType: null,
          // Same value as stored: NOT a change.
          specialtyCode: 'AIM',
          patientAgeAtEncounter: 59,
        },
        { requestId },
      );

      expect(answer.status).toBe(200);

      const rows = await updateAudits(id);
      expect(rows).toHaveLength(1);
      const stored = rows[0] ?? {};

      expect(stored).toMatchObject({
        practice_id: ADMITTED_PRACTICE,
        actor_type: 'USER',
        actor_user_id: CALLER_USER,
        actor_service: null,
        action: 'ENCOUNTER_UPDATED',
        resource_type: 'ENCOUNTER',
        resource_id: id,
        request_id: requestId,
        session_id_hash: null,
        ip_address: null,
        user_agent_hash: null,
        previous_event_sha256: null,
      });
      expect(stored['previous_value']).toStrictEqual({
        treatmentDate: '2026-07-17',
        guarantorType: 'KVG',
        patientAgeAtEncounter: 58,
      });
      expect(stored['new_value']).toStrictEqual({
        treatmentDate: '2026-07-19',
        guarantorType: null,
        patientAgeAtEncounter: 59,
      });
      expect(stored['metadata']).toStrictEqual({});

      const rendered = JSON.stringify([stored['previous_value'], stored['new_value']]);
      for (const forbidden of [
        'version',
        'specialtyCode',
        'occurredAt',
        patientId,
        patientPseudonym,
      ]) {
        expect([forbidden, rendered.includes(forbidden)]).toStrictEqual([forbidden, false]);
      }

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

      expect(sha256HexUtf8(canonicaliseJson(payload))).toBe(stored['event_sha256']);
    });

    it('renders a changed occurredAt in the audit as UTC with milliseconds and Z', async () => {
      const id = await createEncounter();

      expect((await patch(id, { occurredAt: '2026-07-20T12:00:00.5+02:00' })).status).toBe(200);

      const [stored] = await updateAudits(id);
      expect(stored?.['previous_value']).toStrictEqual({ occurredAt: '2026-07-17T06:30:00.000Z' });
      expect(stored?.['new_value']).toStrictEqual({ occurredAt: '2026-07-20T10:00:00.500Z' });
    });

    it('value-no-op PATCH: succeeds, bumps version, sets updated_*, and writes {} / {}', async () => {
      const id = await createEncounter();
      const clockBefore = await databaseClock();

      const answer = await patch(id, {
        occurredAt: '2026-07-17T08:30:00+02:00',
        treatmentDate: '2026-07-17',
        responsiblePhysicianId: CALLER_USER,
        guarantorType: 'KVG',
        insuranceContext: 'AMBULATORY',
        specialtyCode: 'AIM',
        patientAgeAtEncounter: 58,
        patientSexAtEncounter: 'F',
      });

      expect([answer.status, answer.headers['etag'], answer.body['version']]).toStrictEqual([
        200,
        '"2"',
        2,
      ]);
      const after = await storedRow(id);
      expect(after).toMatchObject({ version: 2, updated_by: CALLER_USER });
      expect((after['updated_at'] as Date).getTime()).toBeGreaterThanOrEqual(clockBefore);

      const rows = await updateAudits(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.['previous_value']).toStrictEqual({});
      expect(rows[0]?.['new_value']).toStrictEqual({});
    });

    it('rolls the encounter update back when the audit write fails', async () => {
      const id = await createEncounter();
      const before = await storedRow(id);

      statements.failNext('insert audit_event');
      const failed = await patch(id, { specialtyCode: 'KAR' });

      expect([failed.status, failed.body['code']]).toStrictEqual([500, 'INTERNAL_ERROR']);
      expect(statements.labels).toStrictEqual(['update encounter', 'insert audit_event']);
      expect(await storedRow(id)).toStrictEqual(before);
      expect(await updateAudits(id)).toStrictEqual([]);

      // Nothing was consumed: the SAME If-Match now succeeds.
      expect((await patch(id, { specialtyCode: 'KAR' }, { ifMatch: '"1"' })).status).toBe(200);
    });

    it('writes NO audit row for a refused, conflicting or invalid PATCH', async () => {
      const id = await createEncounter();

      await patch(id, {});
      await patch(id, { notes: 'x' });
      await patch(id, { specialtyCode: 'KAR' }, { ifMatch: '"9"' });
      await patch(id, { specialtyCode: 'KAR' }, { subject: UNADMITTED_SUBJECT });
      await patch(id, { responsiblePhysicianId: NON_MEMBER_USER });

      expect(await updateAudits(id)).toStrictEqual([]);
    });
  });

  describe('POST replay after PATCH (OD-P5-I5C-1)', () => {
    it('replays the original POST key as the CURRENT resource: occurredAt, treatmentDate, version, ETag', async () => {
      const key = nextKey();
      const original = createBody();
      const created = await post(original, key);
      expect(created.status).toBe(201);
      const id = String(created.body['id']);

      const patched = await patch(id, {
        occurredAt: '2026-08-01T09:00:00Z',
        treatmentDate: '2026-08-01',
      });
      expect(patched.status).toBe(200);
      statements.reset();

      const replay = await post(original, key);

      expect(replay.status).toBe(201);
      expect(replay.headers['etag']).toBe('"2"');
      expect(replay.body).toStrictEqual(patched.body);
      expect(replay.body).toMatchObject({
        id,
        status: 'DRAFT',
        version: 2,
        occurredAt: '2026-08-01T09:00:00.000Z',
        treatmentDate: '2026-08-01',
        createdAt: created.body['createdAt'],
      });
      expect(statements.labels).toStrictEqual([
        'select idempotency_advisory_lock',
        'select idempotency_key',
        'select encounter_projection',
      ]);
    });
  });

  describe('privileges and tenant isolation (no grant / policy change)', () => {
    it('keeps the existing twelve-column UPDATE grant exactly — nothing widened', async () => {
      const result = await appClient.query<{ column_name: string }>(
        `select a.attname as "column_name"
           from pg_attribute a
          where a.attrelid = 'public.encounters'::regclass
            and a.attnum > 0 and not a.attisdropped
            and has_column_privilege('copilot_app', a.attrelid, a.attnum, 'UPDATE')
          order by a.attname`,
      );

      expect(result.rows.map((row) => row.column_name)).toStrictEqual(GRANTED_UPDATE_COLUMNS);
    });

    it.each([
      ['patient_reference_id', `'00000000-0000-4000-8000-000000000000'::uuid`],
      ['source_system', `'AXENITA'::integration_provider`],
      ['practice_id', `'${FOREIGN_PRACTICE}'::uuid`],
      ['id', `gen_random_uuid()`],
      ['created_by', `'${NON_MEMBER_USER}'::uuid`],
      ['created_at', 'current_timestamp'],
    ])(
      'refuses copilot_app an UPDATE of the forbidden column %s (42501)',
      async (column, value) => {
        const id = await createEncounter();

        await appClient.query('begin');

        try {
          await appClient.query('select set_config($1, $2, true)', [
            'app.practice_id',
            ADMITTED_PRACTICE,
          ]);
          await expect(
            appClient.query(
              `update "encounters" set "${column}" = ${value} where "id" = $1::uuid`,
              [id],
            ),
          ).rejects.toMatchObject({ code: '42501' });
        } finally {
          await appClient.query('rollback');
        }
      },
    );

    it('lets copilot_app update NO row of another practice even with the granted columns', async () => {
      const id = await createEncounter();

      await appClient.query('begin');

      try {
        await appClient.query('select set_config($1, $2, true)', [
          'app.practice_id',
          FOREIGN_PRACTICE,
        ]);
        const result = await appClient.query(
          `update "encounters" set "specialty_code" = 'X' where "id" = $1::uuid`,
          [id],
        );

        expect(result.rowCount).toBe(0);
      } finally {
        await appClient.query('rollback');
      }
    });
  });

  describe('logging (09 §11)', () => {
    it('never writes PATCH values or identifiers to a log line', async () => {
      const id = await createEncounter();

      await patch(id, { specialtyCode: 'LOG-MARKER-A' });
      await patch(id, { specialtyCode: ' LOG-MARKER-B' }, { ifMatch: '"2"' });
      await patch(id, { responsiblePhysicianId: NON_MEMBER_USER }, { ifMatch: '"2"' });
      await patch(id, { specialtyCode: 'LOG-MARKER-C' }, { ifMatch: 'LOG-MARKER-D' });

      for (const forbidden of ['LOG-MARKER', patientPseudonym, NON_MEMBER_USER]) {
        expect([forbidden, logger.output.includes(forbidden)]).toStrictEqual([forbidden, false]);
      }
    });
  });
});
