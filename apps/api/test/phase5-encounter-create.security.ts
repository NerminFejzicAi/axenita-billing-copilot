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
import { requestSha256 } from '../src/crypto/request-sha256.js';
import { sha256HexUtf8 } from '../src/crypto/sha256-utf8.js';
import { type TenantStatement } from '../src/database/tenant-statement.js';
import { advisoryLockKey } from '../src/idempotency/domain/advisory-lock-key.js';
import {
  IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS,
  IDEMPOTENCY_TTL_MILLISECONDS,
} from '../src/idempotency/idempotency.constants.js';
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
 * `P5-I5B` — `POST /api/v1/encounters` against the REAL migrated schema, the REAL runtime role
 * `copilot_app` (NOBYPASSRLS, owner of nothing) and the REAL HTTP pipeline.
 *
 * Normative sources: `03` §12 (D-085 current contract and corrective addendum); `08` §12.13
 * (D-082 `P5-I5B` evidence + D-085 annotation); D-085 `OD-D085-1` … `OD-D085-17`.
 *
 * It runs on its OWN guarded disposable database, migrated with `prisma migrate deploy` and seeded
 * with the phase 3 seed, exactly like the `P5-I4C` write proof, and it drops it afterwards.
 *
 * `phase5-responsible-physician-ri.security.ts` is NOT touched. This file adds the HTTP-level half
 * D-085 `OD-D085-12` requires: a valid same-practice CO-MEMBER — a different user, holding only
 * `MPA` and with `users.status = INACTIVE` — is accepted as responsible physician through the
 * real `POST` pipeline.
 */

const PRACTICE_HEADER = 'X-Practice-ID';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const REQUEST_ID_HEADER = 'X-Request-ID';

/** The admitted practice and caller: `PRACTICE_ADMIN` + `PHYSICIAN` in demo -> `encounter.create`. */
const ADMITTED_PRACTICE = PHASE_3_SEED_IDS.practiceDemo;
const FOREIGN_PRACTICE = PHASE_3_SEED_IDS.practiceNord;
const CALLER = PHASE_3_SEED_SUBJECTS.practiceAdmin;
const CALLER_USER = PHASE_3_SEED_IDS.userPracticeAdmin;

/** A DIFFERENT same-practice member: `MPA` only, `users.status = INACTIVE`, membership active. */
const CO_MEMBER = PHASE_3_SEED_IDS.userInactive;

/** A real user whose ONLY membership is in ANOTHER practice. */
const FOREIGN_ONLY_MEMBER = PHASE_3_SEED_IDS.userPhysician;

/** A real user with NO membership anywhere — created by this file in `beforeAll`. */
const NON_MEMBER_USER = '22222222-2222-4222-8222-2222222250b1';

/** Subject of a caller without `encounter.create` in demo (member of nord only, zero roles). */
const UNADMITTED_SUBJECT = PHASE_3_SEED_SUBJECTS.physician;

const ENCOUNTER_COLUMNS_FORBIDDEN_IN_RESPONSE = [
  'responsiblePhysicianId',
  'guarantorType',
  'insuranceContext',
  'specialtyCode',
  'patientAgeAtEncounter',
  'patientSexAtEncounter',
  'sourceSystem',
  'diagnoses',
];

let keySequence = 0;

function nextKey(): string {
  keySequence += 1;

  return `p5i5b-sec-${String(keySequence).padStart(4, '0')}`;
}

interface StatementObserver {
  readonly labels: readonly string[];
  reset(): void;
  /** Makes the NEXT statement carrying `label` throw before it reaches the database. */
  failNext(label: string): void;
}

/**
 * Records every FEATURE statement label run on the pinned session, and can inject one failure.
 *
 * The recording wraps the session the identity bootstrap hands out; it does not replace the
 * database, the transaction or the connection. The failure injection throws from the same
 * position a failing statement would, inside the one transaction.
 */
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

describe('POST /api/v1/encounters (P5-I5B)', () => {
  let disposable: DisposableDatabase;
  let app: NestExpressApplication;
  let appClient: Client;
  let statements: StatementObserver;
  let logger: CapturingLogger;

  /** A demo patient reference created through the real `P5-I4C` route. */
  let patientId: string;
  let patientPseudonym: string;
  /** A patient reference that exists ONLY in the foreign practice. */
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

    // The non-member fixture: a real ACTIVE user with no membership anywhere, written through the
    // ONE ratified D-048 maintenance protocol on the migrator credential, exactly as the seed does.
    const migrator = await connect(disposable.migration);

    try {
      await runInForceRlsMaintenanceWindow(migrator, 'users', async (client) => {
        await client.query(
          `insert into "users" (
             "id", "auth_subject", "email", "display_name", "preferred_language",
             "status", "last_login_at", "created_at", "updated_at"
           )
           values ($1, 'dev|p5i5b-non-member', 'p5i5b-non-member@example.invalid',
                   'P5-I5B non-member', 'de-CH', 'ACTIVE'::entity_status, null,
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
        [IDEMPOTENCY_HEADER]: 'p5i5b-sec-patient',
      })
      .send({ sourceSystem: 'MANUAL', externalPatientReference: 'LOCAL-P5I5B-SEC-PATIENT' });

    expect(patient.status).toBe(201);
    patientId = String((patient.body as Record<string, unknown>)['id']);
    patientPseudonym = String((patient.body as Record<string, unknown>)['pseudonym']);

    // A FOREIGN patient reference, committed through `copilot_app` under the foreign practice's
    // own tenant context and the real `patient_references_insert` policy.
    foreignPatientId = randomUUID();
    await appClient.query('begin');
    await appClient.query('select set_config($1, $2, true)', ['app.practice_id', FOREIGN_PRACTICE]);
    await appClient.query(
      `insert into "patient_references"
         ("id", "practice_id", "source_system", "external_patient_ref_hash", "pseudonym",
          "created_at", "updated_at")
       values ($1::uuid, $2::uuid, 'MANUAL'::integration_provider, $3, 'P-NRDP5I5B00',
               current_timestamp, current_timestamp)`,
      [
        foreignPatientId,
        FOREIGN_PRACTICE,
        `h1.${createHash('sha256').update('p5i5b-foreign').digest('hex')}`,
      ],
    );
    await appClient.query('commit');
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

  function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
      diagnoses: [
        { codingSystem: 'ICD-10', code: 'I10', isPrimary: true },
        { codingSystem: 'ICD-10', code: 'E11.9', isPrimary: false },
      ],
      ...overrides,
    };
  }

  interface Posted {
    readonly status: number;
    readonly body: Record<string, unknown>;
    readonly headers: Record<string, string>;
  }

  /** One `POST`. `key: null` sends no `Idempotency-Key`; `header: null` sends no practice. */
  async function post(
    requestBody: unknown,
    options: {
      key?: string | null;
      header?: string | null;
      subject?: string;
      requestId?: string;
    } = {},
  ): Promise<Posted> {
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

    if (options.requestId !== undefined) {
      headers[REQUEST_ID_HEADER] = options.requestId;
    }

    const response = await request(app.getHttpServer())
      .post('/api/v1/encounters')
      .set(headers)
      .send(requestBody as object);

    return {
      status: response.status,
      body: response.body as Record<string, unknown>,
      headers: response.headers,
    };
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

  /** Row counts of every table this route writes, in the admitted practice. */
  async function writeCounts(): Promise<Record<string, string>> {
    const rows = await readAsTenant<Record<string, string>>(
      ADMITTED_PRACTICE,
      `select
         (select count(*) from "encounters")::text          as "encounters",
         (select count(*) from "encounter_diagnoses")::text as "diagnoses",
         (select count(*) from "idempotency_keys")::text    as "claims",
         (select count(*) from "audit_events")::text        as "audits"`,
    );

    return rows[0] ?? {};
  }

  /** A Problem Details body with its per-request members removed, for byte comparison. */
  function stable(problem: Record<string, unknown>): Record<string, unknown> {
    const { requestId: _requestId, ...rest } = problem;

    return rest;
  }

  describe('the successful create (OD-D085-17)', () => {
    it('returns 201, DRAFT, version 1, ETag "1" and EXACTLY the closed document', async () => {
      const created = await post(body());

      expect(created.status).toBe(201);
      expect(created.headers['etag']).toBe('"1"');
      expect(created.headers['content-type']).toContain('application/json');
      expect(Object.keys(created.body).sort()).toStrictEqual(
        ['createdAt', 'id', 'occurredAt', 'patient', 'status', 'treatmentDate', 'version'].sort(),
      );
      expect(Object.keys(created.body['patient'] as object).sort()).toStrictEqual([
        'id',
        'pseudonym',
      ]);
      expect(created.body).toMatchObject({
        status: 'DRAFT',
        version: 1,
        patient: { id: patientId, pseudonym: patientPseudonym },
        occurredAt: '2026-07-17T06:30:00.000Z',
        treatmentDate: '2026-07-17',
      });
      expect(created.body['createdAt']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      for (const forbidden of ENCOUNTER_COLUMNS_FORBIDDEN_IN_RESPONSE) {
        expect(created.body).not.toHaveProperty(forbidden);
      }
    });

    it('runs the canonical statement order on ONE transaction (OD-D085-11)', async () => {
      await post(body());

      expect(statements.labels).toStrictEqual([
        'select idempotency_advisory_lock',
        'select idempotency_key',
        'insert idempotency_key',
        'insert encounter',
        'insert encounter_diagnosis',
        'insert encounter_diagnosis',
        'select encounter_projection',
        'insert audit_event',
        'update idempotency_key',
      ]);
    });

    it('persists the encounter row exactly, with no request-only value invented', async () => {
      const created = await post(
        body({
          responsiblePhysicianId: null,
          guarantorType: null,
          specialtyCode: null,
          patientAgeAtEncounter: null,
        }),
      );

      const rows = await readAsTenant<Record<string, unknown>>(
        ADMITTED_PRACTICE,
        `select *, to_char("treatment_date", 'YYYY-MM-DD') as "treatment_date_text"
           from "encounters" where "id" = $1::uuid`,
        [created.body['id']],
      );

      expect(rows).toHaveLength(1);
      const row = rows[0] ?? {};
      expect(row).toMatchObject({
        practice_id: ADMITTED_PRACTICE,
        patient_reference_id: patientId,
        status: 'DRAFT',
        version: 1,
        source_system: 'MANUAL',
        created_by: CALLER_USER,
        updated_by: null,
        responsible_physician_id: null,
        guarantor_type: null,
        insurance_context: 'AMBULATORY',
        specialty_code: null,
        patient_age_at_encounter: null,
        patient_sex_at_encounter: 'F',
        treatment_date_text: '2026-07-17',
        external_encounter_ref_hash: null,
        external_encounter_ref_ciphertext: null,
        encryption_algorithm: null,
      });
      expect((row['occurred_at'] as Date).toISOString()).toBe('2026-07-17T06:30:00.000Z');
      expect((row['created_at'] as Date).toISOString()).toBe(created.body['createdAt']);
      expect((row['updated_at'] as Date).getTime()).toBe((row['created_at'] as Date).getTime());
    });

    it('persists every diagnosis as UNREVIEWED / MANUAL with no description or type', async () => {
      const created = await post(body());

      const rows = await readAsTenant<Record<string, unknown>>(
        ADMITTED_PRACTICE,
        `select "practice_id", "coding_system", "diagnosis_code", "is_primary", "source",
                "review_state"::text as "review_state", "description", "diagnosis_type"
           from "encounter_diagnoses" where "encounter_id" = $1::uuid
          order by "diagnosis_code"`,
        [created.body['id']],
      );

      expect(rows).toStrictEqual([
        {
          practice_id: ADMITTED_PRACTICE,
          coding_system: 'ICD-10',
          diagnosis_code: 'E11.9',
          is_primary: false,
          source: 'MANUAL',
          review_state: 'UNREVIEWED',
          description: null,
          diagnosis_type: null,
        },
        {
          practice_id: ADMITTED_PRACTICE,
          coding_system: 'ICD-10',
          diagnosis_code: 'I10',
          is_primary: true,
          source: 'MANUAL',
          review_state: 'UNREVIEWED',
          description: null,
          diagnosis_type: null,
        },
      ]);
    });

    it('accepts an empty diagnoses array and absent optional members', async () => {
      const created = await post({
        patientReferenceId: patientId,
        occurredAt: '2026-07-17T06:30:00Z',
        treatmentDate: '2026-07-17',
        sourceSystem: 'MANUAL',
        diagnoses: [],
      });

      expect(created.status).toBe(201);
      expect(statements.labels).not.toContain('insert encounter_diagnosis');
    });
  });

  describe('responsible physician — FK mapping (OD-D085-10, OD-D085-12)', () => {
    it('accepts the caller as their own responsible physician', async () => {
      expect((await post(body({ responsiblePhysicianId: CALLER_USER }))).status).toBe(201);
    });

    it('★ HTTP — accepts a DIFFERENT same-practice co-member (MPA, inactive user) through the real pipeline', async () => {
      const created = await post(body({ responsiblePhysicianId: CO_MEMBER }));

      expect(created.status).toBe(201);
      // Widened to `string`, so `A != B` is decided at runtime, not by the literal types.
      const coMember: string = CO_MEMBER;
      const caller: string = CALLER_USER;

      expect(coMember).not.toBe(caller);

      const rows = await readAsTenant<{ responsible_physician_id: string }>(
        ADMITTED_PRACTICE,
        'select "responsible_physician_id" from "encounters" where "id" = $1::uuid',
        [created.body['id']],
      );

      expect(rows).toStrictEqual([{ responsible_physician_id: CO_MEMBER }]);
    });

    it('answers ONE byte-identical generic 422 for a non-member, a foreign-only member and a nonexistent user', async () => {
      const before = await writeCounts();
      const answers: Posted[] = [];

      for (const responsiblePhysicianId of [NON_MEMBER_USER, FOREIGN_ONLY_MEMBER, randomUUID()]) {
        const refused = await post(body({ responsiblePhysicianId }));

        expect(refused.status).toBe(422);
        expect(refused.headers['content-type']).toContain('application/problem+json');
        // No resource version tag. (Express's own weak content hash on error bodies is
        // pre-existing framework behaviour of every route and is not an entity version.)
        expect(refused.headers['etag'] ?? '').not.toMatch(/^"\d+"$/);
        expect(JSON.stringify(refused.body)).not.toContain(responsiblePhysicianId);
        answers.push(refused);
      }

      expect(stable(answers[0]?.body ?? {})).toStrictEqual({
        type: 'https://api.example.ch/problems/validation-error',
        title: 'Validation failed',
        status: 422,
        code: 'VALIDATION_ERROR',
        detail: 'One or more fields are invalid.',
        instance: '/api/v1/encounters',
      });
      expect(stable(answers[1]?.body ?? {})).toStrictEqual(stable(answers[0]?.body ?? {}));
      expect(stable(answers[2]?.body ?? {})).toStrictEqual(stable(answers[0]?.body ?? {}));

      // Learned from the INSERT, never from a pre-read; and nothing survived the rollback.
      expect(statements.labels.filter((label) => label === 'insert encounter')).toHaveLength(3);
      expect(statements.labels).not.toContain('insert encounter_diagnosis');
      expect(await writeCounts()).toStrictEqual(before);
    });

    it('refuses a malformed physician UUID at request validation, before any statement', async () => {
      const refused = await post(body({ responsiblePhysicianId: 'not-a-uuid' }));

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
  });

  describe('patient reference — FK path (D-069 RULING 2, OD-D085-10)', () => {
    it('answers the SAME static 500 for a foreign and a nonexistent patientReferenceId, with full rollback', async () => {
      const before = await writeCounts();

      const foreign = await post(body({ patientReferenceId: foreignPatientId }));
      const missing = await post(body({ patientReferenceId: randomUUID() }));

      for (const refused of [foreign, missing]) {
        expect(refused.status).toBe(500);
        expect(refused.headers['content-type']).toContain('application/problem+json');
        expect(refused.body['code']).toBe('INTERNAL_ERROR');
        expect(JSON.stringify(refused.body)).not.toMatch(/23503|foreign key|encounters_|patient/i);
      }

      expect(stable(foreign.body)).toStrictEqual(stable(missing.body));
      expect(JSON.stringify(foreign.body)).not.toContain(foreignPatientId);
      // No pre-read: the INSERT is the first business statement for both.
      expect(statements.labels.filter((label) => label === 'insert encounter')).toHaveLength(2);
      expect(statements.labels).not.toContain('select encounter_projection');
      expect(await writeCounts()).toStrictEqual(before);
    });

    it('PINS the empirical answer when BOTH foreign keys are invalid (trigger order is not a contract)', async () => {
      const before = await writeCounts();

      const refused = await post(
        body({ patientReferenceId: foreignPatientId, responsiblePhysicianId: randomUUID() }),
      );

      // EMPIRICAL OBSERVATION on PostgreSQL 16.14, recorded rather than relied on: the patient
      // reference key is checked first and the request receives the static `500`. Either way the
      // request fails closed and writes nothing — that, not the order, is the security property.
      expect(refused.status).toBe(500);
      expect(refused.body['code']).toBe('INTERNAL_ERROR');
      expect(await writeCounts()).toStrictEqual(before);
    });
  });

  describe('idempotency (OD-D085-7)', () => {
    it.each([
      ['absent', null, 'IDEMPOTENCY_KEY_REQUIRED'],
      ['empty', '', 'IDEMPOTENCY_KEY_REQUIRED'],
      ['malformed', 'p5i5b sec', 'VALIDATION_ERROR'],
      ['too long', 'a'.repeat(256), 'VALIDATION_ERROR'],
    ])('answers the canonical 400 for an %s key and writes nothing', async (_name, key, code) => {
      const before = await writeCounts();
      const refused = await post(body(), { key });

      expect(refused.status).toBe(400);
      expect(refused.body['code']).toBe(code);
      expect(statements.labels).toStrictEqual([]);
      expect(await writeCounts()).toStrictEqual(before);
    });

    it('persists the canonical endpoint literal, the digest of the ORIGINAL body and a 48h TTL', async () => {
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
      expect(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS).toBe('POST /encounters');
      expect(claim['endpoint']).toBe('POST /encounters');
      expect(claim['user_id']).toBe(CALLER_USER);
      expect(claim['request_sha256']).toBe(requestSha256(requestBody as JsonValue));
      expect(claim['response_status']).toBe(201);
      expect(claim['response_body']).toStrictEqual({ resourceId: created.body['id'] });
      expect(
        (claim['expires_at'] as Date).getTime() - (claim['completed_at'] as Date).getTime(),
      ).toBe(IDEMPOTENCY_TTL_MILLISECONDS);
    });

    it('replays the same key + same body as the same resource, with no second INSERT or audit', async () => {
      const key = nextKey();
      const requestBody = body();
      const first = await post(requestBody, { key });
      statements.reset();
      const before = await writeCounts();

      const replay = await post(requestBody, { key });

      expect(replay.status).toBe(201);
      expect(replay.headers['etag']).toBe('"1"');
      expect(replay.body).toStrictEqual(first.body);
      expect(statements.labels).toStrictEqual([
        'select idempotency_advisory_lock',
        'select idempotency_key',
        'select encounter_projection',
      ]);
      expect(await writeCounts()).toStrictEqual(before);
    });

    it('answers 409 IDEMPOTENCY_CONFLICT for the same key with a different body', async () => {
      const key = nextKey();
      expect((await post(body(), { key })).status).toBe(201);

      const conflict = await post(body({ specialtyCode: 'KAR' }), { key });

      expect(conflict.status).toBe(409);
      expect(conflict.body['code']).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('keeps an ABSENT optional member and an explicit null DIFFERENT for the hash (409)', async () => {
      const key = nextKey();
      const absent = body();
      delete absent['guarantorType'];

      expect((await post(absent, { key })).status).toBe(201);

      const explicitNull = await post({ ...absent, guarantorType: null }, { key });

      expect(explicitNull.status).toBe(409);
      expect(explicitNull.body['code']).toBe('IDEMPOTENCY_CONFLICT');
      expect(requestSha256(absent as JsonValue)).not.toBe(
        requestSha256({ ...absent, guarantorType: null }),
      );
    });

    it('answers 409 REQUEST_ALREADY_IN_PROGRESS while another connection holds the scope lock', async () => {
      const key = nextKey();
      const lockKey = advisoryLockKey({
        practiceId: ADMITTED_PRACTICE,
        userId: CALLER_USER,
        endpoint: IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS,
        idempotencyKey: key,
      });
      const holder = await connect(disposable.app);

      try {
        await holder.query('begin');
        await holder.query('select pg_advisory_xact_lock($1::bigint)', [lockKey.toString()]);

        const refused = await post(body(), { key });

        expect(refused.status).toBe(409);
        expect(refused.body['code']).toBe('REQUEST_ALREADY_IN_PROGRESS');
        expect(statements.labels).toStrictEqual(['select idempotency_advisory_lock']);
      } finally {
        await holder.query('rollback');
        await holder.end();
      }

      expect((await post(body(), { key })).status).toBe(201);
    });

    it('gives PARALLEL duplicate attempts exactly ONE encounter, ONE claim and ONE audit event', async () => {
      const key = nextKey();
      const requestBody = body();

      const responses = await Promise.all(
        Array.from({ length: 8 }, () => post(requestBody, { key })),
      );

      const created = responses.filter((response) => response.status === 201);
      const refused = responses.filter((response) => response.status !== 201);

      expect(created.length).toBeGreaterThanOrEqual(1);
      for (const response of refused) {
        expect([response.status, response.body['code']]).toStrictEqual([
          409,
          'REQUEST_ALREADY_IN_PROGRESS',
        ]);
      }

      const ids = new Set(created.map((response) => String(response.body['id'])));
      expect(ids.size).toBe(1);
      const encounterId = [...ids][0];

      const counts = await readAsTenant<Record<string, string>>(
        ADMITTED_PRACTICE,
        `select
           (select count(*) from "encounters" where "id" = $1::uuid)::text                 as "encounters",
           (select count(*) from "idempotency_keys" where "idempotency_key" = $2)::text    as "claims",
           (select count(*) from "audit_events" where "resource_id" = $1::uuid)::text      as "audits"`,
        [encounterId, key],
      );

      expect(counts).toStrictEqual([{ encounters: '1', claims: '1', audits: '1' }]);
    });
  });

  describe('audit (OD-D085-8)', () => {
    it('writes ONE minimal ENCOUNTER_CREATED row and reproduces its digest FROM THE STORED ROW', async () => {
      const requestId = randomUUID();
      const created = await post(body({ specialtyCode: 'SPECIALTY-MARKER' }), { requestId });

      expect(created.headers['x-request-id']).toBe(requestId);

      const rows = await readAsTenant<Record<string, unknown>>(
        ADMITTED_PRACTICE,
        'select * from "audit_events" where "resource_id" = $1::uuid',
        [created.body['id']],
      );

      expect(rows).toHaveLength(1);
      const stored = rows[0] ?? {};

      expect(stored).toMatchObject({
        practice_id: ADMITTED_PRACTICE,
        actor_type: 'USER',
        actor_user_id: CALLER_USER,
        actor_service: null,
        action: 'ENCOUNTER_CREATED',
        resource_type: 'ENCOUNTER',
        resource_id: created.body['id'],
        request_id: requestId,
        previous_value: null,
        session_id_hash: null,
        ip_address: null,
        user_agent_hash: null,
        previous_event_sha256: null,
      });
      expect(stored['new_value']).toStrictEqual({ status: 'DRAFT', version: 1 });
      expect(stored['metadata']).toStrictEqual({});

      const rendered = JSON.stringify(stored);
      for (const forbidden of [
        patientId,
        patientPseudonym,
        'SPECIALTY-MARKER',
        'I10',
        'E11.9',
        'KVG',
        'AMBULATORY',
        '2026-07-17',
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
      expect((stored['occurred_at'] as Date).toISOString()).toBe(created.body['createdAt']);
    });

    it('rolls back the encounter, its diagnoses and the claim completion when the audit write fails', async () => {
      const key = nextKey();
      const before = await writeCounts();

      statements.failNext('insert audit_event');
      const failed = await post(body(), { key });

      expect(failed.status).toBe(500);
      expect(failed.body['code']).toBe('INTERNAL_ERROR');
      expect(statements.labels).toContain('insert encounter');
      expect(statements.labels).toContain('insert encounter_diagnosis');
      expect(statements.labels).not.toContain('update idempotency_key');
      expect(await writeCounts()).toStrictEqual(before);

      // The claim rolled back too, so the SAME key is free and now succeeds exactly once.
      statements.reset();
      expect((await post(body(), { key })).status).toBe(201);
    });

    it('writes NO audit row for a validation failure, a refused caller or a replay', async () => {
      const key = nextKey();
      expect((await post(body(), { key })).status).toBe(201);
      const before = await writeCounts();

      await post(body({ sourceSystem: 'AXENITA' }));
      await post(body(), { subject: UNADMITTED_SUBJECT });
      await post(body(), { key });

      expect(await writeCounts()).toStrictEqual(before);
    });
  });

  describe('request validation over the real surface (OD-D085-1 … 6, 16)', () => {
    it.each([
      ['an unknown member', { notes: 'free text' }],
      ['an empty required string', { treatmentDate: '' }],
      ['an empty present optional string', { guarantorType: '' }],
      ['a non-MANUAL sourceSystem', { sourceSystem: 'FHIR' }],
      ['a zone-less occurredAt', { occurredAt: '2026-07-17T08:30:00' }],
      ['an unreal treatmentDate', { treatmentDate: '2026-02-30' }],
      ['an out-of-range age', { patientAgeAtEncounter: 131 }],
      ['a non-integer age', { patientAgeAtEncounter: 58.5 }],
      ['a leading white space', { specialtyCode: ' AIM' }],
      ['an embedded line feed', { insuranceContext: 'AMBU\nLATORY' }],
      [
        'a diagnosis description',
        { diagnoses: [{ codingSystem: 'ICD-10', code: 'I10', isPrimary: true, description: 'x' }] },
      ],
      [
        'two primary diagnoses',
        {
          diagnoses: [
            { codingSystem: 'ICD-10', code: 'I10', isPrimary: true },
            { codingSystem: 'ICD-10', code: 'E11', isPrimary: true },
          ],
        },
      ],
      [
        'a duplicate diagnosis',
        {
          diagnoses: [
            { codingSystem: 'ICD-10', code: 'I10', isPrimary: true },
            { codingSystem: 'ICD-10', code: 'I10', isPrimary: false },
          ],
        },
      ],
      [
        'fifty-one diagnoses',
        {
          diagnoses: Array.from({ length: 51 }, (_, index) => ({
            codingSystem: 'ICD-10',
            code: `C${String(index)}`,
            isPrimary: false,
          })),
        },
      ],
    ])('answers 422 for %s before any statement', async (_name, overrides) => {
      const refused = await post(body(overrides));

      expect(refused.status).toBe(422);
      expect(refused.headers['content-type']).toContain('application/problem+json');
      expect(refused.body['code']).toBe('VALIDATION_ERROR');
      expect(statements.labels).toStrictEqual([]);
    });

    it('refuses an unauthorised caller before the body or the key is judged', async () => {
      const refused = await post(
        { notes: 'not even close' },
        { subject: UNADMITTED_SUBJECT, key: null },
      );

      expect(refused.status).toBe(403);
      expect(refused.body['code']).toBe('ACCESS_DENIED');
      expect(refused.body).not.toHaveProperty('errors');
      expect(statements.labels).toStrictEqual([]);
    });

    it('never writes request values to a log line (09 §11)', async () => {
      await post(body({ specialtyCode: 'LOG-MARKER-A' }));
      await post(body({ patientReferenceId: foreignPatientId, specialtyCode: 'LOG-MARKER-B' }));
      await post(body({ specialtyCode: ' LOG-MARKER-C' }));

      for (const forbidden of ['LOG-MARKER', patientPseudonym, foreignPatientId, 'I10']) {
        expect([forbidden, logger.output.includes(forbidden)]).toStrictEqual([forbidden, false]);
      }
    });
  });

  describe('tenant boundary and the HTTP envelope', () => {
    it('writes rows only into the admitted practice', async () => {
      const created = await post(body());

      const foreign = await readAsTenant<{ count: string }>(
        FOREIGN_PRACTICE,
        'select count(*)::text as count from "encounters" where "id" = $1::uuid',
        [created.body['id']],
      );

      expect(foreign).toStrictEqual([{ count: '0' }]);
    });

    it('propagates the client X-Request-ID into the header and the problem body', async () => {
      const requestId = randomUUID();
      const refused = await post(body({ sourceSystem: 'CSV' }), { requestId });

      expect(refused.headers['x-request-id']).toBe(requestId);
      expect(readProblemDetails(refused).requestId).toBe(requestId);
    });

    it('registers no GET or cancel encounter route; PATCH exists since P5-I5C', async () => {
      const headers = {
        Authorization: developmentBearer(CALLER),
        [PRACTICE_HEADER]: ADMITTED_PRACTICE,
      };
      const id = randomUUID();

      expect(
        (await request(app.getHttpServer()).get('/api/v1/encounters').set(headers)).status,
      ).toBe(404);
      expect(
        (await request(app.getHttpServer()).get(`/api/v1/encounters/${id}`).set(headers)).status,
      ).toBe(404);
      // N-1 (owner-approved P5-I5C reconciliation): PATCH is registered now. Without `If-Match` an
      // admitted caller gets 428 PRECONDITION_REQUIRED — explicitly not the router's 404.
      const patched = await request(app.getHttpServer())
        .patch(`/api/v1/encounters/${id}`)
        .set(headers);
      expect([patched.status, (patched.body as Record<string, unknown>)['code']]).toStrictEqual([
        428,
        'PRECONDITION_REQUIRED',
      ]);
      expect(
        (await request(app.getHttpServer()).post(`/api/v1/encounters/${id}/cancel`).set(headers))
          .status,
      ).toBe(404);
    });
  });
});
