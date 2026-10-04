/**
 * Unit contract of `POST /api/v1/encounters/{encounterId}/cancel` (`P5-I5D`; D-089).
 *
 * Owns what a status code alone cannot show:
 *
 * 1. THE ORDER of D-089 `RULING E` — admission -> encounterId -> Idempotency-Key -> body ->
 *    sanitizer -> hash -> idempotency -> ONE statement -> audit -> completion, asserted against
 *    the FULL recorded call log of the real bootstrap, the real pipeline and the REAL
 *    idempotency service (NB-1A at unit level);
 * 2. NO PRE-READ — exactly one encounter statement on a first execution, the projection read only
 *    on a replay, and nothing at all for every refusal decided before persistence;
 * 3. THE OUTCOME MAPPING — NOT_FOUND / INVALID_STATE_TRANSITION / INCONSISTENT -> 404 / 409 / 500;
 * 4. THE RESOURCE BINDING — lowercase normalisation (NB-PF-1), conflict without a target read;
 * 5. THE AUDIT DOCUMENTS, with the SANITISED reason only.
 *
 * Real PostgreSQL semantics — the lock, the race, RLS, `clock_timestamp()`, the rollback and the
 * HTTP surface — are proven in `test/phase5-encounter-cancel.security.ts`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RecordingDatabase,
  emptyWorld,
  practiceRow,
  type World,
} from '../../../test/support/recording-identity-database.js';
import { AuditWriterService } from '../../audit/application/audit-writer.service.js';
import { type AuditEventInsert } from '../../audit/infrastructure/audit-database.port.js';
import { AuditDatabase } from '../../audit/infrastructure/audit.database.js';
import { ApiException } from '../../common/errors/api-exception.js';
import { type JsonValue } from '../../crypto/json-canonicalizer.js';
import { requestSha256 } from '../../crypto/request-sha256.js';
import type * as RequestSha256Module from '../../crypto/request-sha256.js';
import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import { TenantDatabaseService } from '../../database/tenant-database.service.js';
import { IdentityBootstrapService } from '../../identity/application/identity-bootstrap.service.js';
import { TenantRequestPipeline } from '../../identity/application/tenant-request.pipeline.js';
import { IdempotencyService } from '../../idempotency/application/idempotency.service.js';
import { IdempotencyDatabase } from '../../idempotency/infrastructure/idempotency.database.js';
import {
  ENCOUNTER_CANCEL_STATEMENT,
  ENCOUNTER_PROJECTION_READ_STATEMENT,
  type EncounterCancelResult,
  type EncounterCancelUpdate,
  type EncounterProjectionRow,
} from '../infrastructure/encounter-database.port.js';
import { EncounterDatabase } from '../infrastructure/encounter.database.js';
import { sanitizeCancelReason } from './encounter-cancel-reason.js';
import type * as CancelReasonModule from './encounter-cancel-reason.js';
import {
  EncounterCancelService,
  type EncounterCancelRepresentation,
} from './encounter-cancel.service.js';

vi.mock('./encounter-cancel-reason.js', async (importOriginal) => {
  const original = await importOriginal<typeof CancelReasonModule>();

  return { ...original, sanitizeCancelReason: vi.fn(original.sanitizeCancelReason) };
});

vi.mock('../../crypto/request-sha256.js', async (importOriginal) => {
  const original = await importOriginal<typeof RequestSha256Module>();

  return { ...original, requestSha256: vi.fn(original.requestSha256) };
});

const SUBJECT = 'dev|physician';

const PRACTICE = '11111111-1111-4111-8111-111111111001';
const USER = '22222222-2222-4222-8222-222222222001';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333001';
const ENCOUNTER = '4444aaaa-4444-4444-8444-44444444aaaa';
const OTHER_ENCOUNTER = '4444bbbb-4444-4444-8444-44444444bbbb';
const PATIENT = '55555555-5555-4555-8555-555555555001';
const KEY = 'p5i5d-unit-0001';
const ENDPOINT = 'POST /encounters/{encounterId}/cancel';

const ADMITTED_CHAIN = [
  'BEGIN',
  `set_auth_subject_context(${SUBJECT})`,
  'select users',
  `set_user_context(${USER})`,
  `select practice(${PRACTICE})`,
  `select current_membership(${USER},${PRACTICE})`,
  `set_request_context(${PRACTICE})`,
  `select membership_roles(${MEMBERSHIP})`,
  `select practice_settings(${PRACTICE})`,
];

const LOCK = 'tenant_statement(select idempotency_advisory_lock)';
const CLAIM_READ = 'tenant_statement(select idempotency_key)';
const CLAIM_INSERT = 'tenant_statement(insert idempotency_key)';
const COMPLETION = 'tenant_statement(update idempotency_key)';
const CANCEL = `tenant_statement(${ENCOUNTER_CANCEL_STATEMENT})`;
const PROJECTION = `tenant_statement(${ENCOUNTER_PROJECTION_READ_STATEMENT})`;
const AUDIT_INSERT = 'tenant_statement(insert audit_event)';

function projectionRow(id: string, version = 5): EncounterProjectionRow {
  return {
    id,
    status: 'CANCELLED',
    version,
    patientId: PATIENT,
    patientPseudonym: 'P-AAAAAAAAA1',
    occurredAt: new Date('2026-07-17T06:30:00.000Z'),
    treatmentDate: '2026-07-17',
    createdAt: new Date('2026-07-17T07:00:00.000Z'),
  };
}

function cancelled(previousStatus = 'DRAFT', previousVersion = 4): EncounterCancelResult {
  return {
    outcome: 'CANCELLED',
    applied: {
      projection: projectionRow(ENCOUNTER, previousVersion + 1),
      previousStatus,
      previousVersion,
    },
  };
}

/** The encounter adapter, replaced at its two cancel-path methods, recording into the SAME log. */
class RecordingEncounterDatabase extends EncounterDatabase {
  public readonly updates: EncounterCancelUpdate[] = [];
  public readonly projectionReads: string[] = [];
  public behaviour: () => Promise<EncounterCancelResult> = () => Promise.resolve(cancelled());

  public constructor(private readonly calls: string[]) {
    super();
  }

  public override async cancelEncounter(
    _tenant: AdmittedTenantSession,
    update: EncounterCancelUpdate,
  ): Promise<EncounterCancelResult> {
    this.calls.push(CANCEL);
    this.updates.push(update);

    return this.behaviour();
  }

  public override async findProjection(
    _tenant: AdmittedTenantSession,
    encounterId: string,
  ): Promise<EncounterProjectionRow | undefined> {
    this.calls.push(PROJECTION);
    this.projectionReads.push(encounterId);

    return Promise.resolve(encounterId === ENCOUNTER ? projectionRow(ENCOUNTER) : undefined);
  }
}

/** The audit adapter, recording into the SAME ordered log, optionally failing. */
class RecordingAuditDatabase extends AuditDatabase {
  public readonly events: AuditEventInsert[] = [];
  public fail = false;

  public constructor(private readonly calls: string[]) {
    super();
  }

  public override async append(
    _tenant: AdmittedTenantSession,
    event: AuditEventInsert,
  ): Promise<void> {
    this.calls.push(AUDIT_INSERT);

    if (this.fail) {
      throw new Error('Injected audit failure (test only).');
    }

    this.events.push(event);

    return Promise.resolve();
  }
}

describe('EncounterCancelService', () => {
  let world: World;
  let database: RecordingDatabase;
  let encounters: RecordingEncounterDatabase;
  let audits: RecordingAuditDatabase;
  let service: EncounterCancelService;

  beforeEach(() => {
    world = emptyWorld();
    database = new RecordingDatabase(world);
    encounters = new RecordingEncounterDatabase(database.calls);
    audits = new RecordingAuditDatabase(database.calls);
    service = new EncounterCancelService(
      new IdentityBootstrapService(database),
      new TenantRequestPipeline(),
      new TenantDatabaseService(),
      encounters,
      new IdempotencyService(new IdempotencyDatabase()),
      new AuditWriterService(audits),
    );
    vi.mocked(sanitizeCancelReason).mockClear();
    vi.mocked(requestSha256).mockClear();
  });

  function seedCaller(role: 'PHYSICIAN' | 'MPA' | 'PRACTICE_ADMIN' = 'PHYSICIAN'): void {
    world.bootstrapUsers.push({
      id: USER,
      email: 'physician@example.invalid',
      displayName: 'Dev Physician',
      preferredLanguage: 'de-CH',
      status: 'ACTIVE',
    });
    world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
    world.memberships.push({ id: MEMBERSHIP, practiceId: PRACTICE, active: true, userId: USER });
    world.membershipRoles.push({ membershipId: MEMBERSHIP, practiceId: PRACTICE, role });
    world.settings.push({
      practiceId: PRACTICE,
      allowMpaApproval: false,
      allowBillingSpecialistApproval: false,
    });
  }

  /** A completed claim in THIS caller's scope, as an earlier successful cancel would leave it. */
  function seedCompletedClaim(body: unknown, resourceId: string, completed = true): void {
    world.idempotencyKeys.push({
      id: '66666666-6666-4666-8666-666666666001',
      practiceId: PRACTICE,
      userId: USER,
      endpoint: ENDPOINT,
      idempotencyKey: KEY,
      requestSha256: requestSha256(body as JsonValue),
      responseStatus: completed ? 200 : null,
      responseBody: completed ? { resourceId } : null,
      lockedAt: completed ? null : new Date('2026-10-05T09:00:00.000Z'),
      completedAt: completed ? new Date('2026-10-05T09:00:00.000Z') : null,
      expiresAt: new Date('2026-10-07T09:00:00.000Z'),
    });
    vi.mocked(requestSha256).mockClear();
  }

  function cancel(
    options: { encounterId?: string; key?: string | undefined; body?: unknown } = {},
  ): Promise<EncounterCancelRepresentation> {
    return service.cancelEncounter({
      verifiedAuthSubject: SUBJECT,
      practiceContextHeader: PRACTICE,
      encounterId: options.encounterId ?? ENCOUNTER,
      idempotencyKeyHeader: 'key' in options ? options.key : KEY,
      body: 'body' in options ? options.body : { reason: 'Termin abgesagt' },
    });
  }

  async function refusal(promise: Promise<unknown>): Promise<ApiException> {
    const failure = await promise.then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiException);

    return failure as ApiException;
  }

  async function expectRefusal(
    promise: Promise<unknown>,
    status: number,
    code: string,
  ): Promise<ApiException> {
    const error = await refusal(promise);

    expect([error.getStatus(), error.code]).toStrictEqual([status, code]);

    return error;
  }

  function tenantStatements(): string[] {
    return database.calls.filter((call) => call.startsWith('tenant_statement('));
  }

  describe('first execution', () => {
    it('runs admission, the idempotency claim, ONE cancel statement, the audit and the completion - nothing else', async () => {
      seedCaller();

      await cancel();

      expect(database.calls).toStrictEqual([
        ...ADMITTED_CHAIN,
        LOCK,
        CLAIM_READ,
        CLAIM_INSERT,
        CANCEL,
        AUDIT_INSERT,
        COMPLETION,
        'COMMIT',
      ]);
    });

    it('passes the LOWERCASE path identifier and the admitted user - nothing from the body', async () => {
      seedCaller();
      encounters.behaviour = () => Promise.resolve(cancelled());

      await cancel({ encounterId: ENCOUNTER.toUpperCase() });

      expect(encounters.updates).toStrictEqual([{ encounterId: ENCOUNTER, updatedBy: USER }]);
    });

    it('returns EXACTLY the closed seven-member projection - reason absent', async () => {
      seedCaller();

      const representation = await cancel();

      expect(representation).toStrictEqual({
        id: ENCOUNTER,
        status: 'CANCELLED',
        version: 5,
        patient: { id: PATIENT, pseudonym: 'P-AAAAAAAAA1' },
        occurredAt: '2026-07-17T06:30:00.000Z',
        treatmentDate: '2026-07-17',
        createdAt: '2026-07-17T07:00:00.000Z',
      });
    });

    it('completes the claim with the endpoint template, status 200 and the encounter pointer', async () => {
      seedCaller();

      await cancel({ encounterId: ENCOUNTER.toUpperCase() });

      expect(world.idempotencyKeys).toHaveLength(1);
      expect(world.idempotencyKeys[0]).toMatchObject({
        practiceId: PRACTICE,
        userId: USER,
        endpoint: ENDPOINT,
        idempotencyKey: KEY,
        responseStatus: 200,
        responseBody: { resourceId: ENCOUNTER },
      });
    });

    it('hashes the ORIGINAL parsed body - not the sanitised reason, not the path', async () => {
      seedCaller();
      const body = { reason: '  Termin\u00a0\u00a0abgesagt\u0000 ' };

      await cancel({ body });

      expect(vi.mocked(requestSha256).mock.calls).toStrictEqual([[body]]);
      expect(world.idempotencyKeys[0]?.requestSha256).toBe(requestSha256(body));
      expect(world.idempotencyKeys[0]?.requestSha256).not.toBe(
        requestSha256({ reason: 'Termin abgesagt' }),
      );
    });

    it('writes ONE audit row with the exact previous / new values and the SANITISED reason only', async () => {
      seedCaller();
      encounters.behaviour = () => Promise.resolve(cancelled('READY_FOR_ANALYSIS', 7));

      await cancel({ body: { reason: '  Termin\u00a0\u00a0abgesagt\u0000 ' } });

      expect(audits.events).toHaveLength(1);
      expect(audits.events[0]).toMatchObject({
        practiceId: PRACTICE,
        actorType: 'USER',
        actorUserId: USER,
        action: 'ENCOUNTER_CANCELLED',
        resourceType: 'ENCOUNTER',
        resourceId: ENCOUNTER,
        previousValue: { status: 'READY_FOR_ANALYSIS', version: 7 },
        newValue: { status: 'CANCELLED', version: 8 },
        metadata: { reason: 'Termin abgesagt' },
      });
      expect(JSON.stringify(audits.events[0])).not.toContain('\u00a0');
    });

    it('ignores a stray If-Match - the request type has no member for one', async () => {
      seedCaller();

      await cancel();

      expect(database.calls.some((call) => call.includes('If-Match'))).toBe(false);
    });
  });

  describe('order of the refusals (D-089 RULING E; NB-1A)', () => {
    it('refuses a caller without encounter.cancel (MPA) 403 before the id, the key or the body - nothing downstream', async () => {
      seedCaller('MPA');

      await expectRefusal(
        cancel({ encounterId: 'not-a-uuid', key: undefined, body: { reason: null, extra: 1 } }),
        403,
        'ACCESS_DENIED',
      );

      expect(tenantStatements()).toStrictEqual([]);
      expect(vi.mocked(sanitizeCancelReason)).not.toHaveBeenCalled();
      expect(vi.mocked(requestSha256)).not.toHaveBeenCalled();
      expect(audits.events).toStrictEqual([]);
      expect(encounters.updates).toStrictEqual([]);
      expect(world.idempotencyKeys).toStrictEqual([]);
    });

    it('refuses PRACTICE_ADMIN as well - encounter.cancel is PHYSICIAN only', async () => {
      seedCaller('PRACTICE_ADMIN');

      await expectRefusal(cancel(), 403, 'ACCESS_DENIED');
      expect(tenantStatements()).toStrictEqual([]);
    });

    it('answers a malformed encounterId 400 before the key and the body', async () => {
      seedCaller();

      const error = await expectRefusal(
        cancel({ encounterId: 'MALFORMED-ID', key: undefined, body: [] }),
        400,
        'VALIDATION_ERROR',
      );

      expect(error.detail).toBe('The requested resource identifier is not valid.');
      expect(JSON.stringify(error.getResponse())).not.toContain('MALFORMED-ID');
      expect(tenantStatements()).toStrictEqual([]);
      expect(vi.mocked(sanitizeCancelReason)).not.toHaveBeenCalled();
    });

    it('answers a missing Idempotency-Key 400 before the body', async () => {
      seedCaller();

      await expectRefusal(cancel({ key: undefined, body: [] }), 400, 'IDEMPOTENCY_KEY_REQUIRED');
      expect(tenantStatements()).toStrictEqual([]);
      expect(vi.mocked(sanitizeCancelReason)).not.toHaveBeenCalled();
    });

    it('answers an unaccepted Idempotency-Key 400 VALIDATION_ERROR before the body', async () => {
      seedCaller();

      await expectRefusal(cancel({ key: 'has space', body: [] }), 400, 'VALIDATION_ERROR');
      expect(tenantStatements()).toStrictEqual([]);
    });

    it.each([
      ['a missing body', undefined],
      ['{}', {}],
      ['an unknown member', { reason: 'ok', note: 'x' }],
      ['reason null', { reason: null }],
    ])('answers %s 422 before the sanitizer, the hash and any statement', async (_name, body) => {
      seedCaller();

      await expectRefusal(cancel({ body }), 422, 'VALIDATION_ERROR');
      expect(tenantStatements()).toStrictEqual([]);
      expect(vi.mocked(sanitizeCancelReason)).not.toHaveBeenCalled();
      expect(vi.mocked(requestSha256)).not.toHaveBeenCalled();
    });

    it('NB-PF-2: answers a lone surrogate 422 BEFORE the request hash - never 500 from the canonicaliser', async () => {
      seedCaller();

      await expectRefusal(cancel({ body: { reason: 'a\ud800b' } }), 422, 'VALIDATION_ERROR');
      expect(vi.mocked(sanitizeCancelReason)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(requestSha256)).not.toHaveBeenCalled();
      expect(tenantStatements()).toStrictEqual([]);
    });

    it('answers a reason that sanitises to empty 422 before the hash', async () => {
      seedCaller();

      await expectRefusal(cancel({ body: { reason: ' \t\u0000 ' } }), 422, 'VALIDATION_ERROR');
      expect(vi.mocked(requestSha256)).not.toHaveBeenCalled();
      expect(tenantStatements()).toStrictEqual([]);
    });
  });

  describe('outcome mapping of the ONE statement (D-089 RULING F)', () => {
    it.each([
      ['NOT_FOUND', 404, 'RESOURCE_NOT_FOUND'],
      ['INVALID_STATE_TRANSITION', 409, 'INVALID_STATE_TRANSITION'],
      ['INCONSISTENT', 500, 'INTERNAL_ERROR'],
    ] as const)(
      '%s -> %i %s, no audit, and the claim rolls back',
      async (outcome, status, code) => {
        seedCaller();
        encounters.behaviour = () => Promise.resolve({ outcome });

        const error = await expectRefusal(cancel(), status, code);

        expect(tenantStatements()).toStrictEqual([LOCK, CLAIM_READ, CLAIM_INSERT, CANCEL]);
        expect(audits.events).toStrictEqual([]);
        expect(world.idempotencyKeys).toStrictEqual([]);
        expect(database.rolledBack).toBe(1);
        expect(JSON.stringify(error.getResponse())).not.toContain(ENCOUNTER);
      },
    );

    it('never produces VERSION_CONFLICT', async () => {
      const codes: string[] = [];

      for (const outcome of ['NOT_FOUND', 'INVALID_STATE_TRANSITION', 'INCONSISTENT'] as const) {
        world = emptyWorld();
        database = new RecordingDatabase(world);
        encounters = new RecordingEncounterDatabase(database.calls);
        service = new EncounterCancelService(
          new IdentityBootstrapService(database),
          new TenantRequestPipeline(),
          new TenantDatabaseService(),
          encounters,
          new IdempotencyService(new IdempotencyDatabase()),
          new AuditWriterService(new RecordingAuditDatabase(database.calls)),
        );
        seedCaller();
        encounters.behaviour = () => Promise.resolve({ outcome });
        codes.push((await refusal(cancel())).code);
      }

      expect(codes).not.toContain('VERSION_CONFLICT');
    });

    it('rolls the cancel AND the claim back when the audit write fails', async () => {
      seedCaller();
      audits.fail = true;

      await expect(cancel()).rejects.toThrow('Injected audit failure (test only).');

      expect(tenantStatements()).toStrictEqual([
        LOCK,
        CLAIM_READ,
        CLAIM_INSERT,
        CANCEL,
        AUDIT_INSERT,
      ]);
      expect(world.idempotencyKeys).toStrictEqual([]);
      expect(database.rolledBack).toBe(1);
      expect(database.committed).toBe(0);
    });
  });

  describe('idempotency (D-089 RULING C, RULING D)', () => {
    const BODY = { reason: 'Termin abgesagt' };

    it('replays the same key + same body + same encounter from the CURRENT resource - no second cancel, no audit', async () => {
      seedCaller();
      seedCompletedClaim(BODY, ENCOUNTER);

      const representation = await cancel({ body: BODY });

      expect(tenantStatements()).toStrictEqual([LOCK, CLAIM_READ, PROJECTION]);
      expect(encounters.updates).toStrictEqual([]);
      expect(audits.events).toStrictEqual([]);
      expect(representation).toMatchObject({ id: ENCOUNTER, status: 'CANCELLED', version: 5 });
    });

    it('NB-PF-1: replays an UPPERCASE spelling of the same encounter - not a conflict', async () => {
      seedCaller();
      seedCompletedClaim(BODY, ENCOUNTER);

      const representation = await cancel({ encounterId: ENCOUNTER.toUpperCase(), body: BODY });

      expect(representation.id).toBe(ENCOUNTER);
      expect(encounters.projectionReads).toStrictEqual([ENCOUNTER]);
      expect(tenantStatements()).toStrictEqual([LOCK, CLAIM_READ, PROJECTION]);
    });

    it('answers the same key + same body for a DIFFERENT encounter 409 IDEMPOTENCY_CONFLICT - no encounter statement at all', async () => {
      seedCaller();
      seedCompletedClaim(BODY, OTHER_ENCOUNTER);

      await expectRefusal(cancel({ body: BODY }), 409, 'IDEMPOTENCY_CONFLICT');

      expect(tenantStatements()).toStrictEqual([LOCK, CLAIM_READ]);
      expect(encounters.updates).toStrictEqual([]);
      expect(encounters.projectionReads).toStrictEqual([]);
    });

    it('answers the same key for a DIFFERENT body 409 IDEMPOTENCY_CONFLICT', async () => {
      seedCaller();
      seedCompletedClaim(BODY, ENCOUNTER);

      await expectRefusal(
        cancel({ body: { reason: 'Anderer Grund' } }),
        409,
        'IDEMPOTENCY_CONFLICT',
      );
      expect(tenantStatements()).toStrictEqual([LOCK, CLAIM_READ]);
    });

    it('treats a differently-spelled body with the same sanitised reason as a DIFFERENT body', async () => {
      seedCaller();
      seedCompletedClaim(BODY, ENCOUNTER);

      await expectRefusal(
        cancel({ body: { reason: ' Termin  abgesagt ' } }),
        409,
        'IDEMPOTENCY_CONFLICT',
      );
    });

    it('answers an unfinished claim 409 REQUEST_ALREADY_IN_PROGRESS', async () => {
      seedCaller();
      seedCompletedClaim(BODY, ENCOUNTER, false);

      await expectRefusal(cancel({ body: BODY }), 409, 'REQUEST_ALREADY_IN_PROGRESS');
      expect(tenantStatements()).toStrictEqual([LOCK, CLAIM_READ]);
    });
  });
});
