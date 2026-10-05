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
import { advisoryLockKey } from '../src/idempotency/domain/advisory-lock-key.js';
import {
  IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL,
  IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS,
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
import { runPrismaCli } from './support/run-prisma-cli.js';

/**
 * `P5-I5D` — `POST /api/v1/encounters/{encounterId}/cancel` against the REAL migrated schema, the
 * REAL runtime role `copilot_app` (NOBYPASSRLS, owner of nothing) and the REAL HTTP pipeline.
 *
 * Normative sources: `03` §4, §12 (the D-089 frozen contract); `08` §12.13; `09` §11, §12.2,
 * §18.1; D-089 `RULING B` … `RULING J`, and in particular the minimum evidence of `RULING I`.
 *
 * It runs on its OWN guarded disposable database, migrated with `prisma migrate deploy` and seeded
 * with the phase 3 seed, exactly like the `P5-I5B` / `P5-I5C` proofs, and drops it afterwards. No
 * schema, migration, grant or policy is changed: the existing `encounters` UPDATE grant and the
 * `encounters_update` policy of package `013` are used AS-IS.
 *
 * `phase5-responsible-physician-ri.security.ts` is NOT touched.
 */

const PRACTICE_HEADER = 'X-Practice-ID';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const IF_MATCH_HEADER = 'If-Match';
const REQUEST_ID_HEADER = 'X-Request-ID';

/** The admitted practice and caller: `PRACTICE_ADMIN` + `PHYSICIAN` in demo -> `encounter.cancel`. */
const ADMITTED_PRACTICE = PHASE_3_SEED_IDS.practiceDemo;
const FOREIGN_PRACTICE = PHASE_3_SEED_IDS.practiceNord;
const CALLER = PHASE_3_SEED_SUBJECTS.practiceAdmin;
const CALLER_USER = PHASE_3_SEED_IDS.userPracticeAdmin;

/** A real user whose ONLY membership is in ANOTHER practice. */
const FOREIGN_ONLY_MEMBER = PHASE_3_SEED_IDS.userPhysician;

/**
 * ADMITTED demo members WITHOUT `encounter.cancel` — created by this file in `beforeAll`. The MPA
 * holds `encounter.create` and `encounter.update` but not `encounter.cancel` (`15` §5), so a 403
 * from this caller is the permission decision itself, not a membership refusal.
 */
const MPA_USER = '22222222-2222-4222-8222-2222222250d1';
const MPA_SUBJECT = 'dev|p5i5d-mpa';
const MPA_MEMBERSHIP = '33333333-3333-4333-8333-3333333350d1';
const MPA_ROLE = '44444444-4444-4444-8444-4444444450d1';
const ADMIN_ONLY_USER = '22222222-2222-4222-8222-2222222250d2';
const ADMIN_ONLY_SUBJECT = 'dev|p5i5d-admin-only';
const ADMIN_ONLY_MEMBERSHIP = '33333333-3333-4333-8333-3333333350d2';
const ADMIN_ONLY_ROLE = '44444444-4444-4444-8444-4444444450d2';

const CLOSED_DOCUMENT_KEYS = [
  'createdAt',
  'id',
  'occurredAt',
  'patient',
  'status',
  'treatmentDate',
  'version',
];

/** Every non-ASCII vector is built from its code point, so the source holds no invisible text. */
const cp = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);
const NBSP = cp(0x00a0);
const NUL = cp(0x0000);
const TAB = cp(0x0009);
const U_UMLAUT = cp(0x00fc);
const BOM = cp(0xfeff);
const RLO = cp(0x202e);
const REPLACEMENT = cp(0xfffd);
const BACKSLASH = cp(0x5c);

const FIRST_EXECUTION_LABELS = [
  'select idempotency_advisory_lock',
  'select idempotency_key',
  'insert idempotency_key',
  'update encounter cancel',
  'insert audit_event',
  'update idempotency_key',
];

const REPLAY_LABELS = [
  'select idempotency_advisory_lock',
  'select idempotency_key',
  'select encounter_projection',
];

/** A refused business outcome: the claim is taken, the ONE statement decides, all rolls back. */
const REFUSED_OUTCOME_LABELS = [
  'select idempotency_advisory_lock',
  'select idempotency_key',
  'insert idempotency_key',
  'update encounter cancel',
];

let keySequence = 0;

function nextKey(): string {
  keySequence += 1;

  return `p5i5d-sec-${String(keySequence).padStart(4, '0')}`;
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

describe('POST /api/v1/encounters/{encounterId}/cancel (P5-I5D)', () => {
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
        for (const [id, subject] of [
          [MPA_USER, MPA_SUBJECT],
          [ADMIN_ONLY_USER, ADMIN_ONLY_SUBJECT],
        ] as const) {
          await client.query(
            `insert into "users" ("id", "auth_subject", "email", "display_name",
                                  "preferred_language", "status", "created_at", "updated_at")
             values ($1, $2, $3, $4, 'de-CH', 'ACTIVE'::entity_status, now(), now())`,
            [id, subject, `${subject.replace('dev|', '')}@example.invalid`, `P5-I5D ${subject}`],
          );
        }
      });
      await runInForceRlsMaintenanceWindow(migrator, 'practice_memberships', async (client) => {
        for (const [id, userId] of [
          [MPA_MEMBERSHIP, MPA_USER],
          [ADMIN_ONLY_MEMBERSHIP, ADMIN_ONLY_USER],
        ] as const) {
          await client.query(
            `insert into "practice_memberships" ("id", "practice_id", "user_id",
                                                 "professional_gln", "active",
                                                 "created_at", "updated_at")
             values ($1, $2, $3, null, true, now(), now())`,
            [id, ADMITTED_PRACTICE, userId],
          );
        }
      });
      await runInForceRlsMaintenanceWindow(
        migrator,
        'practice_membership_roles',
        async (client) => {
          for (const [id, membershipId, role] of [
            [MPA_ROLE, MPA_MEMBERSHIP, 'MPA'],
            [ADMIN_ONLY_ROLE, ADMIN_ONLY_MEMBERSHIP, 'PRACTICE_ADMIN'],
          ] as const) {
            await client.query(
              `insert into "practice_membership_roles" ("id", "practice_id", "membership_id",
                                                      "role", "created_at", "updated_at")
             values ($1, $2, $3, $4::membership_role, now(), now())`,
              [id, ADMITTED_PRACTICE, membershipId, role],
            );
          }
        },
      );
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
        [IDEMPOTENCY_HEADER]: 'p5i5d-sec-patient',
      })
      .send({ sourceSystem: 'MANUAL', externalPatientReference: 'LOCAL-P5I5D-SEC-PATIENT' });

    expect(patient.status).toBe(201);
    patientId = String((patient.body as Record<string, unknown>)['id']);
    patientPseudonym = String((patient.body as Record<string, unknown>)['pseudonym']);

    foreignPatientId = randomUUID();
    await asTenant(FOREIGN_PRACTICE, async () => {
      await appClient.query(
        `insert into "patient_references"
           ("id", "practice_id", "source_system", "external_patient_ref_hash", "pseudonym",
            "created_at", "updated_at")
         values ($1::uuid, $2::uuid, 'MANUAL'::integration_provider, $3, 'P-NRDP5I5D00',
                 current_timestamp, current_timestamp)`,
        [
          foreignPatientId,
          FOREIGN_PRACTICE,
          `h1.${createHash('sha256').update('p5i5d-foreign').digest('hex')}`,
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

  function createBody(): Record<string, unknown> {
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
    };
  }

  /** Creates a fresh DRAFT encounter at version 1 and clears the statement log. */
  async function createEncounter(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/encounters')
      .set({
        Authorization: developmentBearer(CALLER),
        [PRACTICE_HEADER]: ADMITTED_PRACTICE,
        [IDEMPOTENCY_HEADER]: nextKey(),
      })
      .send(createBody());

    expect(created.status).toBe(201);
    statements.reset();

    return String((created.body as Record<string, unknown>)['id']);
  }

  /** A FOREIGN encounter at version 1, committed under the foreign practice's own context. */
  async function createForeignEncounter(): Promise<string> {
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

    return foreignId;
  }

  /**
   * One cancel. `key: null` sends no `Idempotency-Key`; `header: null` sends no practice;
   * `raw` sends the given bytes as `application/json` instead of serialising `requestBody`.
   */
  async function cancel(
    encounterId: string,
    requestBody: unknown,
    options: {
      key?: string | null;
      header?: string | null;
      subject?: string;
      requestId?: string;
      ifMatch?: string;
      raw?: string | Buffer;
    } = {},
  ): Promise<Answer> {
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

    if (options.ifMatch !== undefined) {
      headers[IF_MATCH_HEADER] = options.ifMatch;
    }

    const pending = request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounterId}/cancel`)
      .set(headers);

    // A raw body is written VERBATIM. superagent would otherwise run its JSON serializer over a
    // `Buffer` (producing `{"type":"Buffer","data":[...]}`), so the identity serializer is what
    // lets a malformed UTF-8 byte actually reach the server's body parser.
    const response =
      options.raw !== undefined
        ? await pending
            .set('Content-Type', 'application/json')
            .serialize((value: unknown) => value as string)
            .send(options.raw)
        : requestBody === undefined
          ? await pending
          : await pending.send(requestBody as object);

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
      `select *, "status"::text as "status_text" from "encounters" where "id" = $1::uuid`,
      [encounterId],
    );

    expect(rows).toHaveLength(1);

    return rows[0] ?? {};
  }

  async function cancelAudits(encounterId: string): Promise<Record<string, unknown>[]> {
    return readAsTenant<Record<string, unknown>>(
      ADMITTED_PRACTICE,
      `select * from "audit_events"
        where "resource_id" = $1::uuid and "action" = 'ENCOUNTER_CANCELLED'
        order by "occurred_at"`,
      [encounterId],
    );
  }

  async function claimsFor(key: string): Promise<Record<string, unknown>[]> {
    return readAsTenant<Record<string, unknown>>(
      ADMITTED_PRACTICE,
      `select "endpoint", "response_status", "response_body", "completed_at", "user_id"
         from "idempotency_keys" where "idempotency_key" = $1`,
      [key],
    );
  }

  /** The DATABASE clock — `updated_at` is `clock_timestamp()` (the P5-I5C precedent). */
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

  async function waitForLockWaiters(count: number): Promise<number> {
    const deadline = Date.now() + 15000;
    let waiting = 0;

    while (waiting < count && Date.now() < deadline) {
      const result = await appClient.query<{ waiting: string }>(
        `select count(*)::text as "waiting" from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
      );
      waiting = Number(result.rows[0]?.waiting ?? '0');

      if (waiting < count) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }

    return waiting;
  }

  // ---------------------------------------------------------------------------------------------

  describe('the successful cancel (D-089 RULING C, RULING F)', () => {
    it('DRAFT -> CANCELLED: 200, ETag == new version, EXACTLY the closed document, reason absent', async () => {
      const id = await createEncounter();

      const answer = await cancel(id, { reason: 'Termin abgesagt' });

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
        status: 'CANCELLED',
        version: 2,
        patient: { id: patientId, pseudonym: patientPseudonym },
        occurredAt: '2026-07-17T06:30:00.000Z',
        treatmentDate: '2026-07-17',
      });
      expect(answer.body).not.toHaveProperty('reason');
      expect(JSON.stringify(answer.body)).not.toContain('Termin');
    });

    it('READY_FOR_ANALYSIS -> CANCELLED', async () => {
      const id = await createEncounter();
      await setStatus(id, 'READY_FOR_ANALYSIS');

      const answer = await cancel(id, { reason: 'Doppelt erfasst' });

      expect([answer.status, answer.body['status'], answer.body['version']]).toStrictEqual([
        200,
        'CANCELLED',
        2,
      ]);
      expect(await storedRow(id)).toMatchObject({ status_text: 'CANCELLED', version: 2 });
      expect((await cancelAudits(id))[0]?.['previous_value']).toStrictEqual({
        status: 'READY_FOR_ANALYSIS',
        version: 1,
      });
    });

    it('runs EXACTLY the idempotency claim, ONE cancel statement, the audit and the completion', async () => {
      const id = await createEncounter();

      expect((await cancel(id, { reason: 'x' })).status).toBe(200);
      expect(statements.labels).toStrictEqual(FIRST_EXECUTION_LABELS);
    });

    it('writes status, version + 1, updated_by and a DATABASE-clock updated_at - and nothing else', async () => {
      const id = await createEncounter();
      const before = await storedRow(id);

      const clockBefore = await databaseClock();
      expect((await cancel(id, { reason: 'x' })).status).toBe(200);
      const clockAfter = await databaseClock();
      const after = await storedRow(id);

      expect(before).toMatchObject({ status_text: 'DRAFT', version: 1, updated_by: null });
      expect(after).toMatchObject({
        status_text: 'CANCELLED',
        version: 2,
        updated_by: CALLER_USER,
      });

      const updatedAt = (after['updated_at'] as Date).getTime();
      expect(updatedAt).toBeGreaterThanOrEqual(clockBefore);
      expect(updatedAt).toBeLessThanOrEqual(clockAfter);

      for (const column of Object.keys(before)) {
        if (['status', 'status_text', 'version', 'updated_by', 'updated_at'].includes(column)) {
          continue;
        }

        expect([column, after[column]]).toStrictEqual([column, before[column]]);
      }
    });

    it('ignores a stray If-Match - no VERSION_CONFLICT, no 428', async () => {
      const id = await createEncounter();

      const answer = await cancel(id, { reason: 'x' }, { ifMatch: '"99"' });

      expect([answer.status, answer.body['version']]).toStrictEqual([200, 2]);
    });
  });

  describe('audit (D-089 RULING F)', () => {
    it('writes ONE ENCOUNTER_CANCELLED row with the exact documents, and reproduces its digest FROM THE STORED ROW', async () => {
      const id = await createEncounter();
      const requestId = randomUUID();
      const raw = `  Patient${NBSP}${NBSP}w${U_UMLAUT}nscht${TAB}Abbruch${NUL} `;

      const answer = await cancel(id, { reason: raw }, { requestId });

      expect(answer.status).toBe(200);

      const rows = await cancelAudits(id);
      expect(rows).toHaveLength(1);
      const stored = rows[0] ?? {};

      expect(stored).toMatchObject({
        practice_id: ADMITTED_PRACTICE,
        actor_type: 'USER',
        actor_user_id: CALLER_USER,
        actor_service: null,
        action: 'ENCOUNTER_CANCELLED',
        resource_type: 'ENCOUNTER',
        resource_id: id,
        request_id: requestId,
        session_id_hash: null,
        ip_address: null,
        user_agent_hash: null,
        previous_event_sha256: null,
      });
      expect(stored['previous_value']).toStrictEqual({ status: 'DRAFT', version: 1 });
      expect(stored['new_value']).toStrictEqual({ status: 'CANCELLED', version: 2 });
      expect(stored['metadata']).toStrictEqual({ reason: `Patient w${U_UMLAUT}nscht Abbruch` });

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

    it('preserves Cf characters in the persisted sanitised reason (NB-1C)', async () => {
      const id = await createEncounter();
      const raw = ` ${BOM}Grund${RLO}x `;

      expect((await cancel(id, { reason: raw })).status).toBe(200);
      expect((await cancelAudits(id))[0]?.['metadata']).toStrictEqual({
        reason: `${BOM}Grund${RLO}x`,
      });
    });

    it('rolls the cancel AND the claim back when the audit write fails; the same key then succeeds', async () => {
      const id = await createEncounter();
      const before = await storedRow(id);
      const key = nextKey();

      statements.failNext('insert audit_event');
      const failed = await cancel(id, { reason: 'x' }, { key });

      expect([failed.status, failed.body['code']]).toStrictEqual([500, 'INTERNAL_ERROR']);
      expect(statements.labels).toStrictEqual(FIRST_EXECUTION_LABELS.slice(0, 5));
      expect(await storedRow(id)).toStrictEqual(before);
      expect(await cancelAudits(id)).toStrictEqual([]);
      expect(await claimsFor(key)).toStrictEqual([]);

      const retried = await cancel(id, { reason: 'x' }, { key });
      expect([retried.status, retried.body['version']]).toStrictEqual([200, 2]);
      expect(await cancelAudits(id)).toHaveLength(1);
    });

    it('writes NO audit row for a refused, conflicting or invalid cancel', async () => {
      const id = await createEncounter();

      await cancel(id, {});
      await cancel(id, { reason: '   ' });
      await cancel(id, { reason: 'x' }, { key: null });
      await cancel(id, { reason: 'x' }, { subject: MPA_SUBJECT });
      await setStatus(id, 'CLOSED');
      await cancel(id, { reason: 'x' });

      expect(await cancelAudits(id)).toStrictEqual([]);
    });
  });

  describe('idempotency (D-089 RULING C, RULING D)', () => {
    it('completes the claim with the endpoint TEMPLATE, response_status 200 and the pointer', async () => {
      const id = await createEncounter();
      const key = nextKey();

      expect((await cancel(id, { reason: 'x' }, { key })).status).toBe(200);

      const claims = await claimsFor(key);
      expect(claims).toHaveLength(1);
      expect(claims[0]).toMatchObject({
        endpoint: 'POST /encounters/{encounterId}/cancel',
        response_status: 200,
        response_body: { resourceId: id },
        user_id: CALLER_USER,
      });
      expect(claims[0]?.['completed_at']).toBeInstanceOf(Date);
      expect(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL).toBe(claims[0]?.['endpoint']);
    });

    it('replays the same key + same body: 200, same body and ETag, no second mutation, no second audit', async () => {
      const id = await createEncounter();
      const key = nextKey();

      const first = await cancel(id, { reason: 'Termin abgesagt' }, { key });
      statements.reset();
      const replay = await cancel(id, { reason: 'Termin abgesagt' }, { key });

      expect(replay.status).toBe(200);
      expect(replay.headers['etag']).toBe(first.headers['etag']);
      expect(replay.body).toStrictEqual(first.body);
      expect(statements.labels).toStrictEqual(REPLAY_LABELS);
      expect(await storedRow(id)).toMatchObject({ version: 2, status_text: 'CANCELLED' });
      expect(await cancelAudits(id)).toHaveLength(1);
    });

    it('NB-PF-1: replays an UPPERCASE spelling of the same encounter as 200, not as a conflict', async () => {
      const id = await createEncounter();
      const key = nextKey();

      const first = await cancel(id, { reason: 'x' }, { key });
      statements.reset();
      const replay = await cancel(id.toUpperCase(), { reason: 'x' }, { key });

      expect([replay.status, replay.body]).toStrictEqual([200, first.body]);
      expect(statements.labels).toStrictEqual(REPLAY_LABELS);
      expect(await cancelAudits(id)).toHaveLength(1);
    });

    it('also cancels via an UPPERCASE path on a first execution and caches the lowercase pointer', async () => {
      const id = await createEncounter();
      const key = nextKey();

      const answer = await cancel(id.toUpperCase(), { reason: 'x' }, { key });

      expect([answer.status, answer.body['id']]).toStrictEqual([200, id]);
      expect((await claimsFor(key))[0]?.['response_body']).toStrictEqual({ resourceId: id });
    });

    it('answers the same key for a DIFFERENT body 409 IDEMPOTENCY_CONFLICT', async () => {
      const id = await createEncounter();
      const key = nextKey();

      expect((await cancel(id, { reason: 'erster Grund' }, { key })).status).toBe(200);
      statements.reset();

      const conflict = await cancel(id, { reason: 'zweiter Grund' }, { key });

      expect([conflict.status, conflict.body['code']]).toStrictEqual([409, 'IDEMPOTENCY_CONFLICT']);
      expect(statements.labels).toStrictEqual([
        'select idempotency_advisory_lock',
        'select idempotency_key',
      ]);
    });

    it('answers the same key + same reason for a DIFFERENT encounter 409 IDEMPOTENCY_CONFLICT - no encounter statement for B', async () => {
      const first = await createEncounter();
      const second = await createEncounter();
      const key = nextKey();
      const secondBefore = await storedRow(second);

      expect((await cancel(first, { reason: 'gleich' }, { key })).status).toBe(200);
      statements.reset();

      const conflict = await cancel(second, { reason: 'gleich' }, { key });

      expect([conflict.status, conflict.body['code']]).toStrictEqual([409, 'IDEMPOTENCY_CONFLICT']);
      expect(statements.labels).toStrictEqual([
        'select idempotency_advisory_lock',
        'select idempotency_key',
      ]);
      expect(JSON.stringify(stable(conflict.body))).not.toContain(first);
      expect(await storedRow(second)).toStrictEqual(secondBefore);
      expect(await cancelAudits(second)).toStrictEqual([]);
    });

    it('answers 409 REQUEST_ALREADY_IN_PROGRESS while another connection holds the scope lock', async () => {
      const id = await createEncounter();
      const key = nextKey();
      const lockKey = advisoryLockKey({
        practiceId: ADMITTED_PRACTICE,
        userId: CALLER_USER,
        endpoint: IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL,
        idempotencyKey: key,
      });
      const holder = await connect(disposable.app);

      try {
        await holder.query('begin');
        await holder.query('select pg_advisory_xact_lock($1::bigint)', [lockKey.toString()]);

        const refused = await cancel(id, { reason: 'x' }, { key });

        expect([refused.status, refused.body['code']]).toStrictEqual([
          409,
          'REQUEST_ALREADY_IN_PROGRESS',
        ]);
        expect(statements.labels).toStrictEqual(['select idempotency_advisory_lock']);
      } finally {
        await holder.query('rollback');
        await holder.end();
      }

      expect(await storedRow(id)).toMatchObject({ status_text: 'DRAFT', version: 1 });
      expect((await cancel(id, { reason: 'x' }, { key })).status).toBe(200);
    });

    it('answers a NEW key against an already CANCELLED encounter 409 INVALID_STATE_TRANSITION - the claim rolls back', async () => {
      const id = await createEncounter();

      expect((await cancel(id, { reason: 'x' })).status).toBe(200);
      statements.reset();

      const key = nextKey();
      const again = await cancel(id, { reason: 'x' }, { key });

      expect([again.status, again.body['code']]).toStrictEqual([409, 'INVALID_STATE_TRANSITION']);
      expect(again.headers['etag'] ?? '').not.toMatch(/^"\d+"$/);
      expect(statements.labels).toStrictEqual(REFUSED_OUTCOME_LABELS);
      expect(await claimsFor(key)).toStrictEqual([]);
      expect(await storedRow(id)).toMatchObject({ status_text: 'CANCELLED', version: 2 });
      expect(await cancelAudits(id)).toHaveLength(1);
    });

    it('leaves encounter create idempotency at 201 (shared-service regression)', async () => {
      const key = nextKey();

      const created = await request(app.getHttpServer())
        .post('/api/v1/encounters')
        .set({
          Authorization: developmentBearer(CALLER),
          [PRACTICE_HEADER]: ADMITTED_PRACTICE,
          [IDEMPOTENCY_HEADER]: key,
        })
        .send(createBody());
      const replay = await request(app.getHttpServer())
        .post('/api/v1/encounters')
        .set({
          Authorization: developmentBearer(CALLER),
          [PRACTICE_HEADER]: ADMITTED_PRACTICE,
          [IDEMPOTENCY_HEADER]: key,
        })
        .send(createBody());

      expect([created.status, replay.status]).toStrictEqual([201, 201]);
      expect(await claimsFor(key)).toMatchObject([
        { endpoint: IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS, response_status: 201 },
      ]);
    });
  });

  describe('404 / 409 without an existence oracle (D-089 RULING F; 09 \u00a718.1 T1)', () => {
    it('answers nonexistent and cross-tenant with ONE equivalent 404 - only the bounded statement ran', async () => {
      const foreignId = await createForeignEncounter();
      const foreignBefore = await storedRow(foreignId, FOREIGN_PRACTICE);
      statements.reset();

      const missing = await cancel(randomUUID(), { reason: 'x' });
      const missingLabels = [...statements.labels];
      statements.reset();
      const foreign = await cancel(foreignId, { reason: 'x' });
      const foreignLabels = [...statements.labels];

      for (const answer of [missing, foreign]) {
        expect(answer.status).toBe(404);
        expect(answer.headers['content-type']).toContain('application/problem+json');
        expect(answer.body['code']).toBe('RESOURCE_NOT_FOUND');
        expect(answer.headers['etag'] ?? '').not.toMatch(/^"\d+"$/);
      }

      expect(stable(foreign.body)).toStrictEqual(stable(missing.body));
      expect(JSON.stringify(stable(foreign.body))).not.toContain(foreignId);
      expect(missingLabels).toStrictEqual(REFUSED_OUTCOME_LABELS);
      expect(foreignLabels).toStrictEqual(REFUSED_OUTCOME_LABELS);
      expect(await storedRow(foreignId, FOREIGN_PRACTICE)).toStrictEqual(foreignBefore);
    });

    it.each(['CANCELLED', 'CLOSED'])(
      'answers a visible %s encounter 409 INVALID_STATE_TRANSITION, writing nothing',
      async (status) => {
        const id = await createEncounter();
        await setStatus(id, status);
        const before = await storedRow(id);

        const answer = await cancel(id, { reason: 'x' });

        expect([answer.status, answer.body['code']]).toStrictEqual([
          409,
          'INVALID_STATE_TRANSITION',
        ]);
        expect(statements.labels).toStrictEqual(REFUSED_OUTCOME_LABELS);
        expect(await storedRow(id)).toStrictEqual(before);
        expect(await cancelAudits(id)).toStrictEqual([]);
      },
    );
  });

  describe('request order: admission -> encounterId -> Idempotency-Key -> body (D-089 RULING E)', () => {
    it('NB-1A: an ADMITTED caller without encounter.cancel gets 403 before the id, the key and the body are judged', async () => {
      const answer = await cancel(
        'not-a-uuid',
        { reason: null, unknown: 'NB1A-MARKER' },
        { subject: MPA_SUBJECT, key: null },
      );

      expect([answer.status, answer.body['code']]).toStrictEqual([403, 'ACCESS_DENIED']);
      expect(answer.body).not.toHaveProperty('errors');
      // No encounter statement, no idempotency statement and no claim: the statement log is EMPTY,
      // so neither the sanitizer's caller nor the hash can have run.
      expect(statements.labels).toStrictEqual([]);
      expect(JSON.stringify(answer.body)).not.toContain('NB1A-MARKER');
      expect(logger.output).not.toContain('NB1A-MARKER');
    });

    it('refuses a non-PHYSICIAN caller 403 even for a fully valid request (MPA, PRACTICE_ADMIN only)', async () => {
      const id = await createEncounter();

      for (const subject of [MPA_SUBJECT, ADMIN_ONLY_SUBJECT]) {
        const answer = await cancel(id, { reason: 'x' }, { subject });

        expect([subject, answer.status, answer.body['code']]).toStrictEqual([
          subject,
          403,
          'ACCESS_DENIED',
        ]);
      }

      expect(statements.labels).toStrictEqual([]);
      expect(await storedRow(id)).toMatchObject({ status_text: 'DRAFT', version: 1 });
    });

    it('answers a malformed encounterId 400 with no statement and no echo, even without a key', async () => {
      const answer = await cancel('MALFORMED-ID-MARKER', { reason: null }, { key: null });

      expect([answer.status, answer.body['code']]).toStrictEqual([400, 'VALIDATION_ERROR']);
      expect(answer.body).not.toHaveProperty('errors');
      expect(answer.body['detail']).toBe('The requested resource identifier is not valid.');
      expect(JSON.stringify(stable(answer.body))).not.toContain('MALFORMED-ID-MARKER');
      expect(logger.output).not.toContain('MALFORMED-ID-MARKER');
      expect(statements.labels).toStrictEqual([]);
    });

    it('answers a missing Idempotency-Key 400 IDEMPOTENCY_KEY_REQUIRED before the body is judged', async () => {
      const id = await createEncounter();

      const answer = await cancel(id, { reason: null }, { key: null });

      expect([answer.status, answer.body['code']]).toStrictEqual([400, 'IDEMPOTENCY_KEY_REQUIRED']);
      expect(statements.labels).toStrictEqual([]);
    });

    it('answers an unaccepted Idempotency-Key 400 VALIDATION_ERROR before the body is judged', async () => {
      const id = await createEncounter();

      const answer = await cancel(id, { reason: null }, { key: 'contains space' });

      expect([answer.status, answer.body['code']]).toStrictEqual([400, 'VALIDATION_ERROR']);
      expect(statements.labels).toStrictEqual([]);
    });
  });

  describe('body and reason validation (D-089 RULING B, RULING E, RULING G)', () => {
    it.each([
      ['a missing body', undefined],
      ['{}', {}],
      ['an array body', [{ reason: 'x' }]],
      ['an unknown member', { reason: 'x', cancelReason: 'x' }],
      ['reason null', { reason: null }],
      ['reason a number', { reason: 1 }],
      ['reason a boolean', { reason: false }],
      ['reason an object', { reason: {} }],
      ['reason an array', { reason: [] }],
      ['an empty reason', { reason: '' }],
      ['a whitespace-only reason', { reason: '  \t\n ' }],
      ['a NUL-only reason', { reason: NUL }],
      ['a reason of 256 raw bytes', { reason: 'a'.repeat(256) }],
      ['a reason that NFC-expands beyond 255 bytes (NB-1B)', { reason: cp(0x0958).repeat(85) }],
    ])('answers %s 422 VALIDATION_ERROR - no statement, no claim', async (_name, body) => {
      const id = await createEncounter();
      const key = nextKey();

      const answer = await cancel(id, body, { key });

      expect([answer.status, answer.body['code']]).toStrictEqual([422, 'VALIDATION_ERROR']);
      expect(statements.labels).toStrictEqual([]);
      expect(await claimsFor(key)).toStrictEqual([]);
      expect(await storedRow(id)).toMatchObject({ status_text: 'DRAFT', version: 1 });
    });

    it('accepts exactly 255 raw bytes', async () => {
      const id = await createEncounter();

      expect((await cancel(id, { reason: 'a'.repeat(255) })).status).toBe(200);
      expect((await cancelAudits(id))[0]?.['metadata']).toStrictEqual({ reason: 'a'.repeat(255) });
    });

    it('NB-PF-2: answers a lone surrogate (JSON escape in the raw body) 422 - never 500 from the canonicaliser', async () => {
      const id = await createEncounter();
      const key = nextKey();
      const raw = `{"reason":"a${BACKSLASH}ud800b"}`;

      const answer = await cancel(id, undefined, { key, raw });

      expect([answer.status, answer.body['code']]).toStrictEqual([422, 'VALIDATION_ERROR']);
      expect(statements.labels).toStrictEqual([]);
      expect(await claimsFor(key)).toStrictEqual([]);
    });

    it('accepts a valid surrogate pair sent as a JSON escape', async () => {
      const id = await createEncounter();
      const raw = `{"reason":"ok ${BACKSLASH}ud83d${BACKSLASH}ude00"}`;

      expect((await cancel(id, undefined, { raw })).status).toBe(200);
      expect((await cancelAudits(id))[0]?.['metadata']).toStrictEqual({
        reason: `ok ${cp(0x1f600)}`,
      });
    });

    it('pins the parser on malformed transport UTF-8: a\\xFFb arrives as a U+FFFD b and is accepted (RULING I item 20)', async () => {
      const id = await createEncounter();
      const raw = Buffer.concat([
        Buffer.from('{"reason":"a', 'utf8'),
        Buffer.from([0xff]),
        Buffer.from('b"}', 'utf8'),
      ]);

      const answer = await cancel(id, undefined, { raw });

      // The JSON body parser decodes the wire bytes as UTF-8 and REPLACES the invalid byte with
      // U+FFFD before the application sees the string; the application does not reconstruct the
      // original bytes and does not reject U+FFFD (D-089 RULING G).
      expect(answer.status).toBe(200);
      expect((await cancelAudits(id))[0]?.['metadata']).toStrictEqual({
        reason: `a${REPLACEMENT}b`,
      });
    });
  });

  describe('concurrency (D-089 RULING F)', () => {
    it('REAL two-connection race, different keys: exactly ONE 200 and ONE 409 INVALID_STATE_TRANSITION', async () => {
      const id = await createEncounter();
      const keys = [nextKey(), nextKey()];
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

        const racing = Promise.all(keys.map((key) => cancel(id, { reason: 'race' }, { key })));

        expect(await waitForLockWaiters(2)).toBe(2);
        await holder.query('rollback');

        const answers = await racing;
        const outcomes = answers
          .map((answer) => [answer.status, answer.body['code'] ?? null])
          .sort((left, right) => Number(left[0]) - Number(right[0]));

        expect(outcomes).toStrictEqual([
          [200, null],
          [409, 'INVALID_STATE_TRANSITION'],
        ]);
      } finally {
        await holder.query('rollback').catch(() => undefined);
        await holder.end();
      }

      expect(await storedRow(id)).toMatchObject({ status_text: 'CANCELLED', version: 2 });
      expect(await cancelAudits(id)).toHaveLength(1);

      const claims = [...(await claimsFor(keys[0] ?? '')), ...(await claimsFor(keys[1] ?? ''))];
      expect(claims).toHaveLength(1);
      expect(claims[0]).toMatchObject({ response_status: 200, response_body: { resourceId: id } });
    });
  });

  describe('privacy (09 \u00a711, \u00a712.2; D-089 RULING B L4-C)', () => {
    it('never persists, returns or logs the raw reason; only the sanitised value reaches audit metadata', async () => {
      const id = await createEncounter();
      const raw = `   RAW-REASON-MARKER${NBSP}${NBSP}leading and trailing${TAB}${NUL}   `;
      const sanitized = 'RAW-REASON-MARKER leading and trailing';

      const answer = await cancel(id, { reason: raw });
      expect(answer.status).toBe(200);

      // Refusals that carried the marker as well.
      await cancel(id, { reason: `RAW-REASON-MARKER${'x'.repeat(300)}` });
      await cancel(id, { reason: 'RAW-REASON-MARKER', extra: 'RAW-REASON-MARKER' });
      await cancel('RAW-REASON-MARKER', { reason: 'RAW-REASON-MARKER' });

      const row = await storedRow(id);
      const [audit] = await cancelAudits(id);

      expect(JSON.stringify(row)).not.toContain('RAW-REASON-MARKER');
      expect(JSON.stringify(answer.body)).not.toContain('RAW-REASON-MARKER');
      expect(JSON.stringify([audit?.['previous_value'], audit?.['new_value']])).not.toContain(
        'RAW-REASON-MARKER',
      );
      expect(audit?.['metadata']).toStrictEqual({ reason: sanitized });
      expect(JSON.stringify(audit?.['metadata'])).not.toContain(NBSP);
      expect(logger.output).not.toContain('RAW-REASON-MARKER');
      expect(logger.output).not.toContain('leading and trailing');
    });
  });
});
