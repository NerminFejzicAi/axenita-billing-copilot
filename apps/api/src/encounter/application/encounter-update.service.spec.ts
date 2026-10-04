/**
 * Unit contract of `PATCH /api/v1/encounters/{encounterId}` (`P5-I5C`; D-087).
 *
 * Owns what a status code alone cannot show:
 *
 * 1. THE ORDER — auth/admission -> encounterId -> If-Match -> body -> ONE statement -> audit,
 *    asserted against the FULL recorded call log of the real bootstrap and the real pipeline.
 * 2. NO PRE-READ, NO POST-READ, NO IDEMPOTENCY — exactly one encounter statement on a success,
 *    and none at all for every refusal decided before persistence.
 * 3. THE OUTCOME MAPPING of the atomic statement — VERSION_CONFLICT / INVALID_STATE_TRANSITION /
 *    INCONSISTENT -> 409 / 409 / 500, and the ONE translated FK.
 * 4. THE MINIMISED AUDIT DIFF, value-no-op included.
 *
 * Real PostgreSQL semantics — the lock, the race, the grants, the policies, `clock_timestamp()`
 * and the rollback — are proven in `test/phase5-encounter-patch.security.ts`.
 */

import { beforeEach, describe, expect, it } from 'vitest';

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
import { eventSha256 } from '../../crypto/event-sha256.js';
import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import { TenantDatabaseService } from '../../database/tenant-database.service.js';
import { IdentityBootstrapService } from '../../identity/application/identity-bootstrap.service.js';
import { TenantRequestPipeline } from '../../identity/application/tenant-request.pipeline.js';
import {
  ENCOUNTER_PATCH_STATEMENT,
  ResponsiblePhysicianNotAssignableError,
  type EncounterMutableValues,
  type EncounterPatchApplied,
  type EncounterPatchResult,
  type EncounterPatchUpdate,
} from '../infrastructure/encounter-database.port.js';
import { EncounterDatabase } from '../infrastructure/encounter.database.js';
import {
  buildEncounterUpdateDiff,
  EncounterUpdateService,
  type EncounterRepresentation,
} from './encounter-update.service.js';

const SUBJECT = 'dev|physician';

const PRACTICE = '11111111-1111-4111-8111-111111111001';
const USER = '22222222-2222-4222-8222-222222222001';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333001';
const ENCOUNTER = '44444444-4444-4444-8444-444444444001';
const PATIENT = '55555555-5555-4555-8555-555555555001';

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

const PATCH_STATEMENT = `tenant_statement(${ENCOUNTER_PATCH_STATEMENT})`;
const AUDIT_INSERT = 'tenant_statement(insert audit_event)';

const STORED: EncounterMutableValues = {
  occurredAt: new Date('2026-07-17T06:30:00.000Z'),
  treatmentDate: '2026-07-17',
  responsiblePhysicianId: USER,
  guarantorType: 'KVG',
  insuranceContext: 'AMBULATORY',
  specialtyCode: 'AIM',
  patientAgeAtEncounter: 58,
  patientSexAtEncounter: 'F',
};

const NOTHING_CHANGED: EncounterPatchApplied['changed'] = {
  occurredAt: false,
  treatmentDate: false,
  responsiblePhysicianId: false,
  guarantorType: false,
  insuranceContext: false,
  specialtyCode: false,
  patientAgeAtEncounter: false,
  patientSexAtEncounter: false,
};

function applied(
  next: Partial<EncounterMutableValues>,
  changed: Partial<EncounterPatchApplied['changed']>,
  version = 4,
): EncounterPatchResult {
  const values = { ...STORED, ...next };

  return {
    outcome: 'UPDATED',
    applied: {
      projection: {
        id: ENCOUNTER,
        status: 'DRAFT',
        version,
        patientId: PATIENT,
        patientPseudonym: 'P-AAAAAAAAA1',
        occurredAt: values.occurredAt,
        treatmentDate: values.treatmentDate,
        createdAt: new Date('2026-07-17T07:00:00.000Z'),
      },
      previous: STORED,
      next: values,
      changed: { ...NOTHING_CHANGED, ...changed },
    },
  };
}

/** The encounter adapter, replaced at its ONE method, recording into the SAME ordered log. */
class RecordingEncounterDatabase extends EncounterDatabase {
  public readonly updates: EncounterPatchUpdate[] = [];
  public readonly tenants: string[] = [];
  public behaviour: () => Promise<EncounterPatchResult> = () =>
    Promise.resolve(applied({ specialtyCode: 'KAR' }, { specialtyCode: true }));

  public constructor(private readonly calls: string[]) {
    super();
  }

  public override async patchEncounter(
    tenant: AdmittedTenantSession,
    update: EncounterPatchUpdate,
  ): Promise<EncounterPatchResult> {
    this.calls.push(PATCH_STATEMENT);
    this.tenants.push(tenant.practiceId);
    this.updates.push(update);

    return this.behaviour();
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

describe('EncounterUpdateService', () => {
  let world: World;
  let database: RecordingDatabase;
  let encounters: RecordingEncounterDatabase;
  let audits: RecordingAuditDatabase;
  let service: EncounterUpdateService;

  beforeEach(() => {
    world = emptyWorld();
    database = new RecordingDatabase(world);
    encounters = new RecordingEncounterDatabase(database.calls);
    audits = new RecordingAuditDatabase(database.calls);
    service = new EncounterUpdateService(
      new IdentityBootstrapService(database),
      new TenantRequestPipeline(),
      new TenantDatabaseService(),
      encounters,
      new AuditWriterService(audits),
    );
  });

  function seedCaller(role: 'PHYSICIAN' | 'MPA' | 'BILLING_SPECIALIST' = 'PHYSICIAN'): void {
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

  function patch(
    options: {
      encounterId?: string;
      ifMatch?: string | undefined;
      body?: unknown;
    } = {},
  ): Promise<EncounterRepresentation> {
    return service.updateEncounter({
      verifiedAuthSubject: SUBJECT,
      practiceContextHeader: PRACTICE,
      encounterId: options.encounterId ?? ENCOUNTER,
      ifMatchHeader: 'ifMatch' in options ? options.ifMatch : '"3"',
      body: 'body' in options ? options.body : { specialtyCode: 'KAR' },
    });
  }

  async function refusal(promise: Promise<unknown>): Promise<ApiException> {
    try {
      await promise;
    } catch (error) {
      if (error instanceof ApiException) {
        return error;
      }

      throw error;
    }

    throw new Error('expected a refusal');
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

  describe('success', () => {
    it('runs admission, then ONE statement, then the audit insert — and nothing else', async () => {
      seedCaller();

      await patch();

      expect(database.calls).toStrictEqual([
        ...ADMITTED_CHAIN,
        PATCH_STATEMENT,
        AUDIT_INSERT,
        'COMMIT',
      ]);
    });

    it('passes the admitted practice, the admitted user and the If-Match version', async () => {
      seedCaller();

      await patch({ ifMatch: '"3"', body: { occurredAt: '2026-07-18T08:00:00+02:00' } });

      expect(encounters.tenants).toStrictEqual([PRACTICE]);
      expect(encounters.updates).toStrictEqual([
        {
          encounterId: ENCOUNTER,
          expectedVersion: 3,
          updatedBy: USER,
          assignments: {
            occurredAt: '2026-07-18T08:00:00+02:00',
            treatmentDate: undefined,
            responsiblePhysicianId: undefined,
            guarantorType: undefined,
            insuranceContext: undefined,
            specialtyCode: undefined,
            patientAgeAtEncounter: undefined,
            patientSexAtEncounter: undefined,
          },
        },
      ]);
    });

    it('returns EXACTLY the closed seven-member projection of the updated row', async () => {
      seedCaller();
      encounters.behaviour = () =>
        Promise.resolve(
          applied(
            { occurredAt: new Date('2026-07-18T06:00:00.000Z'), treatmentDate: '2026-07-18' },
            { occurredAt: true, treatmentDate: true },
            9,
          ),
        );

      const representation = await patch({
        body: { occurredAt: '2026-07-18T08:00:00+02:00', treatmentDate: '2026-07-18' },
      });

      expect(representation).toStrictEqual({
        id: ENCOUNTER,
        status: 'DRAFT',
        version: 9,
        patient: { id: PATIENT, pseudonym: 'P-AAAAAAAAA1' },
        occurredAt: '2026-07-18T06:00:00.000Z',
        treatmentDate: '2026-07-18',
        createdAt: '2026-07-17T07:00:00.000Z',
      });
    });

    it('ignores a stray Idempotency-Key — there is no parameter for one and no idempotency statement', async () => {
      seedCaller();

      await patch();

      expect(database.calls.some((call) => call.includes('idempotency'))).toBe(false);
    });
  });

  describe('order of the refusals', () => {
    it('refuses a caller without encounter.update with 403 before the id, If-Match or body', async () => {
      seedCaller('BILLING_SPECIALIST');

      await expectRefusal(
        patch({ encounterId: 'not-a-uuid', ifMatch: undefined, body: [] }),
        403,
        'ACCESS_DENIED',
      );
      expect(database.calls).not.toContain(PATCH_STATEMENT);
    });

    it('admits MPA (encounter.update is PHYSICIAN + MPA)', async () => {
      seedCaller('MPA');

      await expect(patch()).resolves.toMatchObject({ id: ENCOUNTER });
    });

    it('answers a malformed encounterId 400 AFTER admission, BEFORE If-Match/body, with no statement and no echo', async () => {
      seedCaller();

      const error = await expectRefusal(
        patch({ encounterId: 'MALFORMED-MARKER', ifMatch: undefined, body: [] }),
        400,
        'VALIDATION_ERROR',
      );

      expect(database.calls).toStrictEqual([...ADMITTED_CHAIN, 'ROLLBACK']);
      expect(error.errors).toBeUndefined();
      expect(JSON.stringify({ detail: error.detail, message: error.message })).not.toContain(
        'MALFORMED-MARKER',
      );
    });

    it('answers a missing If-Match 428 before the body is judged', async () => {
      seedCaller();

      await expectRefusal(
        patch({ ifMatch: undefined, body: { status: 'CANCELLED' } }),
        428,
        'PRECONDITION_REQUIRED',
      );
      expect(database.calls).toStrictEqual([...ADMITTED_CHAIN, 'ROLLBACK']);
    });

    it.each([
      ['empty', ''],
      ['unquoted', '3'],
      ['weak', 'W/"3"'],
      ['wildcard', '*'],
      ['list', '"3", "4"'],
      ['leading zero', '"03"'],
      ['negative', '"-1"'],
      ['padded', ' "3"'],
      ['above int4', '"2147483648"'],
      ['eleven digits', '"10000000000"'],
    ])('answers a %s If-Match 400 before the body is judged', async (_name, ifMatch) => {
      seedCaller();

      await expectRefusal(patch({ ifMatch, body: { status: 'X' } }), 400, 'VALIDATION_ERROR');
      expect(database.calls).toStrictEqual([...ADMITTED_CHAIN, 'ROLLBACK']);
    });

    it('accepts If-Match "0" and "2147483647" syntactically — the statement decides', async () => {
      seedCaller();
      encounters.behaviour = () => Promise.resolve({ outcome: 'VERSION_CONFLICT' });

      await expectRefusal(patch({ ifMatch: '"0"' }), 409, 'VERSION_CONFLICT');
      await expectRefusal(patch({ ifMatch: '"2147483647"' }), 409, 'VERSION_CONFLICT');
      expect(encounters.updates.map((update) => update.expectedVersion)).toStrictEqual([
        0, 2147483647,
      ]);
    });

    it.each([
      ['an empty body', {}, 400],
      ['a non-object body', [], 422],
      ['a forbidden member', { status: 'CANCELLED' }, 422],
      ['an unknown member', { notes: 'x' }, 422],
      ['a null occurredAt', { occurredAt: null }, 422],
    ])('refuses %s with no statement and no audit', async (_name, body, status) => {
      seedCaller();

      await expectRefusal(patch({ body }), status, 'VALIDATION_ERROR');
      expect(database.calls).toStrictEqual([...ADMITTED_CHAIN, 'ROLLBACK']);
      expect(audits.events).toStrictEqual([]);
    });
  });

  describe('the outcome of the atomic statement', () => {
    it.each([
      ['VERSION_CONFLICT', 409, 'VERSION_CONFLICT'],
      ['INVALID_STATE_TRANSITION', 409, 'INVALID_STATE_TRANSITION'],
      ['INCONSISTENT', 500, 'INTERNAL_ERROR'],
    ] as const)('maps %s to %i %s with no audit and never 404', async (outcome, status, code) => {
      seedCaller();
      encounters.behaviour = () => Promise.resolve({ outcome });

      await expectRefusal(patch(), status, code);
      expect(database.calls).toStrictEqual([...ADMITTED_CHAIN, PATCH_STATEMENT, 'ROLLBACK']);
      expect(audits.events).toStrictEqual([]);
    });

    it('translates ONLY the responsible-physician FK into the generic 422, with no field list', async () => {
      seedCaller();
      encounters.behaviour = () => Promise.reject(new ResponsiblePhysicianNotAssignableError());

      const error = await expectRefusal(
        patch({ body: { responsiblePhysicianId: '66666666-6666-4666-8666-666666666001' } }),
        422,
        'VALIDATION_ERROR',
      );

      expect(error.errors).toBeUndefined();
      expect(error.detail).toBe('One or more fields are invalid.');
      expect(audits.events).toStrictEqual([]);
    });

    it('propagates every OTHER statement failure unchanged — no global 23503 -> 422', async () => {
      seedCaller();
      const unrelated = Object.assign(new Error('unrelated foreign key failure'), {
        code: '23503',
      });
      encounters.behaviour = () => Promise.reject(unrelated);

      await expect(patch()).rejects.toBe(unrelated);
      expect(audits.events).toStrictEqual([]);
    });

    it('propagates an audit failure, so the transaction rolls the update back', async () => {
      seedCaller();
      audits.fail = true;

      await expect(patch()).rejects.toThrow('Injected audit failure');
      expect(database.calls).toStrictEqual([
        ...ADMITTED_CHAIN,
        PATCH_STATEMENT,
        AUDIT_INSERT,
        'ROLLBACK',
      ]);
    });
  });

  describe('audit (OD-P5-I5C-3)', () => {
    it('writes USER / ENCOUNTER / ENCOUNTER_UPDATED with ONLY the changed members and metadata {}', async () => {
      seedCaller();
      encounters.behaviour = () =>
        Promise.resolve(
          applied(
            {
              occurredAt: new Date('2026-07-18T06:00:00.123Z'),
              guarantorType: null,
              patientAgeAtEncounter: 59,
            },
            { occurredAt: true, guarantorType: true, patientAgeAtEncounter: true },
          ),
        );

      await patch({
        body: {
          occurredAt: '2026-07-18T08:00:00.123+02:00',
          guarantorType: null,
          patientAgeAtEncounter: 59,
          specialtyCode: 'AIM',
        },
      });

      expect(audits.events).toHaveLength(1);
      const [event] = audits.events;

      expect(event).toMatchObject({
        practiceId: PRACTICE,
        actorType: 'USER',
        actorUserId: USER,
        action: 'ENCOUNTER_UPDATED',
        resourceType: 'ENCOUNTER',
        resourceId: ENCOUNTER,
        metadata: {},
      });
      expect(event?.previousValue).toStrictEqual({
        occurredAt: '2026-07-17T06:30:00.000Z',
        guarantorType: 'KVG',
        patientAgeAtEncounter: 58,
      });
      expect(event?.newValue).toStrictEqual({
        occurredAt: '2026-07-18T06:00:00.123Z',
        guarantorType: null,
        patientAgeAtEncounter: 59,
      });
      expect(event?.newValue).not.toHaveProperty('version');
      expect(event?.eventSha256).toBe(
        eventSha256({
          id: event?.id ?? '',
          practiceId: PRACTICE,
          occurredAt: event?.occurredAt ?? new Date(0),
          actorType: 'USER',
          actorUserId: USER,
          actorService: null,
          action: 'ENCOUNTER_UPDATED',
          resourceType: 'ENCOUNTER',
          resourceId: ENCOUNTER,
          requestId: null,
          previousValue: event?.previousValue ?? null,
          newValue: event?.newValue ?? null,
          metadata: {},
        }),
      );
    });

    it('writes {} / {} for a value-no-op PATCH — it still succeeds and is still audited', async () => {
      seedCaller();
      encounters.behaviour = () => Promise.resolve(applied({}, {}, 4));

      const representation = await patch({ body: { specialtyCode: 'AIM' } });

      expect(representation.version).toBe(4);
      expect(audits.events).toHaveLength(1);
      expect(audits.events[0]?.previousValue).toStrictEqual({});
      expect(audits.events[0]?.newValue).toStrictEqual({});
    });
  });
});

describe('buildEncounterUpdateDiff', () => {
  it('keys by API camelCase, renders occurredAt as UTC .sssZ and keeps null as null', () => {
    const result = applied(
      {
        occurredAt: new Date('2026-12-31T23:59:59.999Z'),
        treatmentDate: '2027-01-01',
        responsiblePhysicianId: null,
        insuranceContext: null,
        specialtyCode: 'KAR',
        patientSexAtEncounter: null,
      },
      {
        occurredAt: true,
        treatmentDate: true,
        responsiblePhysicianId: true,
        insuranceContext: true,
        specialtyCode: true,
        patientSexAtEncounter: true,
      },
    );

    if (result.outcome !== 'UPDATED') {
      throw new Error('fixture');
    }

    expect(buildEncounterUpdateDiff(result.applied)).toStrictEqual({
      previousValue: {
        occurredAt: '2026-07-17T06:30:00.000Z',
        treatmentDate: '2026-07-17',
        responsiblePhysicianId: USER,
        insuranceContext: 'AMBULATORY',
        specialtyCode: 'AIM',
        patientSexAtEncounter: 'F',
      },
      newValue: {
        occurredAt: '2026-12-31T23:59:59.999Z',
        treatmentDate: '2027-01-01',
        responsiblePhysicianId: null,
        insuranceContext: null,
        specialtyCode: 'KAR',
        patientSexAtEncounter: null,
      },
    });
  });

  it('trusts the statement comparison: an unchanged member is omitted even if supplied', () => {
    const result = applied({}, {});

    if (result.outcome !== 'UPDATED') {
      throw new Error('fixture');
    }

    expect(buildEncounterUpdateDiff(result.applied)).toStrictEqual({
      previousValue: {},
      newValue: {},
    });
  });
});
