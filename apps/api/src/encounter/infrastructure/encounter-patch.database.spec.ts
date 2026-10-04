import { describe, expect, it } from 'vitest';

import {
  type AdmittedTenantSession,
  type TenantStatement,
} from '../../database/tenant-statement.js';
import {
  ENCOUNTER_PATCH_STATEMENT,
  ENCOUNTER_PATCHABLE_STATUSES,
  ResponsiblePhysicianNotAssignableError,
  type EncounterPatchUpdate,
} from './encounter-database.port.js';
import { EncounterDatabase, EncounterPatchInvariantError } from './encounter.database.js';

/**
 * `EncounterDatabase.patchEncounter` without a database (`P5-I5C`; D-087): the ONE translated
 * foreign key, the fail-closed narrowing of the statement row, and the shape of the ONE statement.
 * Its real PostgreSQL behaviour is proven in `test/phase5-encounter-patch.security.ts`.
 */

const PRACTICE = '11111111-1111-4111-8111-111111111001';
const ENCOUNTER = '44444444-4444-4444-8444-444444444001';

const UPDATE: EncounterPatchUpdate = {
  encounterId: ENCOUNTER,
  expectedVersion: 3,
  updatedBy: '22222222-2222-4222-8222-222222222001',
  assignments: {
    occurredAt: undefined,
    treatmentDate: '2026-07-18',
    responsiblePhysicianId: null,
    guarantorType: undefined,
    insuranceContext: undefined,
    specialtyCode: 'KAR',
    patientAgeAtEncounter: undefined,
    patientSexAtEncounter: undefined,
  },
};

/** The `P2010` shape Prisma 7.9.1 + `@prisma/adapter-pg` reports for a raw-statement failure. */
function driverError(sqlState: string, constraint: string): Error {
  return Object.assign(new Error('Raw query failed.'), {
    code: 'P2010',
    meta: {
      driverAdapterError: {
        cause: {
          originalCode: sqlState,
          originalMessage: `insert or update on table "encounters" violates foreign key constraint "${constraint}"`,
          constraint,
        },
      },
    },
  });
}

function tenantReturning(
  result: readonly unknown[] | Error,
  seen: TenantStatement[] = [],
): AdmittedTenantSession {
  return {
    practiceId: PRACTICE,
    run: <TRow>(statement: TenantStatement): Promise<readonly TRow[]> => {
      seen.push(statement);

      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result as readonly TRow[]);
    },
  };
}

const UPDATED_ROW = {
  outcome: 'UPDATED',
  id: ENCOUNTER,
  status: 'DRAFT',
  version: 4,
  patientId: '55555555-5555-4555-8555-555555555001',
  patientPseudonym: 'P-AAAAAAAAA1',
  occurredAt: new Date('2026-07-17T06:30:00.000Z'),
  treatmentDate: '2026-07-18',
  createdAt: new Date('2026-07-17T07:00:00.000Z'),
  responsiblePhysicianId: null,
  guarantorType: 'KVG',
  insuranceContext: null,
  specialtyCode: 'KAR',
  patientAgeAtEncounter: 58,
  patientSexAtEncounter: 'F',
  previousOccurredAt: new Date('2026-07-17T06:30:00.000Z'),
  previousTreatmentDate: '2026-07-17',
  previousResponsiblePhysicianId: '22222222-2222-4222-8222-222222222001',
  previousGuarantorType: 'KVG',
  previousInsuranceContext: null,
  previousSpecialtyCode: 'AIM',
  previousPatientAgeAtEncounter: 58,
  previousPatientSexAtEncounter: 'F',
  occurredAtChanged: false,
  treatmentDateChanged: true,
  responsiblePhysicianIdChanged: true,
  guarantorTypeChanged: false,
  insuranceContextChanged: false,
  specialtyCodeChanged: true,
  patientAgeAtEncounterChanged: false,
  patientSexAtEncounterChanged: false,
};

describe('EncounterDatabase.patchEncounter — foreign keys (OD-D085-10)', () => {
  it('translates encounters_responsible_physician_membership_fk, and only it', async () => {
    const database = new EncounterDatabase();

    await expect(
      database.patchEncounter(
        tenantReturning(driverError('23503', 'encounters_responsible_physician_membership_fk')),
        UPDATE,
      ),
    ).rejects.toBeInstanceOf(ResponsiblePhysicianNotAssignableError);
  });

  it.each([
    ['the patient-reference FK', driverError('23503', 'encounters_patient_reference_fk')],
    ['an unknown future FK', driverError('23503', 'encounters_some_future_fk')],
    [
      'a different SQLSTATE naming the physician FK',
      driverError('23514', 'encounters_responsible_physician_membership_fk'),
    ],
    ['a plain error', new Error('connection reset')],
  ])('propagates %s UNCHANGED — no global 23503 -> 422', async (_name, error) => {
    const database = new EncounterDatabase();

    await expect(database.patchEncounter(tenantReturning(error), UPDATE)).rejects.toBe(error);
  });
});

describe('EncounterDatabase.patchEncounter — result narrowing', () => {
  it.each(['VERSION_CONFLICT', 'INVALID_STATE_TRANSITION', 'INCONSISTENT'] as const)(
    'reports %s with no applied material',
    async (outcome) => {
      const database = new EncounterDatabase();

      await expect(
        database.patchEncounter(tenantReturning([{ ...UPDATED_ROW, outcome }]), UPDATE),
      ).resolves.toStrictEqual({ outcome });
    },
  );

  it('narrows UPDATED into projection, previous, next and changed', async () => {
    const database = new EncounterDatabase();

    const result = await database.patchEncounter(tenantReturning([UPDATED_ROW]), UPDATE);

    expect(result).toStrictEqual({
      outcome: 'UPDATED',
      applied: {
        projection: {
          id: ENCOUNTER,
          status: 'DRAFT',
          version: 4,
          patientId: UPDATED_ROW.patientId,
          patientPseudonym: 'P-AAAAAAAAA1',
          occurredAt: UPDATED_ROW.occurredAt,
          treatmentDate: '2026-07-18',
          createdAt: UPDATED_ROW.createdAt,
        },
        previous: {
          occurredAt: UPDATED_ROW.previousOccurredAt,
          treatmentDate: '2026-07-17',
          responsiblePhysicianId: UPDATED_ROW.previousResponsiblePhysicianId,
          guarantorType: 'KVG',
          insuranceContext: null,
          specialtyCode: 'AIM',
          patientAgeAtEncounter: 58,
          patientSexAtEncounter: 'F',
        },
        next: {
          occurredAt: UPDATED_ROW.occurredAt,
          treatmentDate: '2026-07-18',
          responsiblePhysicianId: null,
          guarantorType: 'KVG',
          insuranceContext: null,
          specialtyCode: 'KAR',
          patientAgeAtEncounter: 58,
          patientSexAtEncounter: 'F',
        },
        changed: {
          occurredAt: false,
          treatmentDate: true,
          responsiblePhysicianId: true,
          guarantorType: false,
          insuranceContext: false,
          specialtyCode: true,
          patientAgeAtEncounter: false,
          patientSexAtEncounter: false,
        },
      },
    });
  });

  it.each([
    ['zero rows', []],
    ['two rows', [UPDATED_ROW, UPDATED_ROW]],
    ['an unknown outcome', [{ ...UPDATED_ROW, outcome: 'NOT_FOUND' }]],
    ['UPDATED without a version', [{ ...UPDATED_ROW, version: null }]],
    ['UPDATED without a pseudonym', [{ ...UPDATED_ROW, patientPseudonym: null }]],
    ['UPDATED without a comparison', [{ ...UPDATED_ROW, specialtyCodeChanged: null }]],
  ])('fails CLOSED on %s', async (_name, rows) => {
    const database = new EncounterDatabase();

    await expect(database.patchEncounter(tenantReturning(rows), UPDATE)).rejects.toBeInstanceOf(
      EncounterPatchInvariantError,
    );
  });
});

describe('EncounterDatabase.patchEncounter — the ONE statement', () => {
  async function statementOf(update: EncounterPatchUpdate = UPDATE): Promise<TenantStatement> {
    const seen: TenantStatement[] = [];

    await new EncounterDatabase().patchEncounter(tenantReturning([UPDATED_ROW], seen), update);

    expect(seen).toHaveLength(1);

    return seen[0] as TenantStatement;
  }

  it('is exactly one statement, labelled without any value', async () => {
    const statement = await statementOf();

    expect(statement.label).toBe(ENCOUNTER_PATCH_STATEMENT);
    expect(statement.label).not.toContain(ENCOUNTER);
    expect(statement.label).not.toContain(PRACTICE);
  });

  it('locks the target, guards version and status, bumps version and uses clock_timestamp()', async () => {
    const sql = (await statementOf()).sql.sql.replace(/\s+/g, ' ');

    expect(sql).toMatch(/with "target" as materialized \(.* for update \)/);
    expect(sql).toContain('"version" = e."version" + 1');
    expect(sql).toContain('"updated_at" = clock_timestamp()');
    expect(sql).toContain('is distinct from');
    expect(sql).not.toMatch(/\bnow\(\)|current_timestamp/i);
    expect(sql).not.toMatch(/savepoint|begin|commit/i);
  });

  it('never assigns a column outside the PATCH surface', async () => {
    const sql = (await statementOf()).sql.sql;

    for (const column of [
      'patient_reference_id',
      'source_system',
      'status',
      'practice_id',
      'id',
      'created_by',
      'created_at',
    ]) {
      expect([column, new RegExp(`(^|[\\s,])"${column}"\\s*=`).test(sql)]).toStrictEqual([
        column,
        false,
      ]);
    }
  });

  it('binds the admitted practice, the id, the version, the user, and BOTH patchable statuses', async () => {
    const values = (await statementOf()).sql.values;

    expect(values).toContain(PRACTICE);
    expect(values).toContain(ENCOUNTER);
    expect(values).toContain(3);
    expect(values).toContain(UPDATE.updatedBy);
    expect([...ENCOUNTER_PATCHABLE_STATUSES]).toStrictEqual(['DRAFT', 'READY_FOR_ANALYSIS']);
    for (const status of ENCOUNTER_PATCHABLE_STATUSES) {
      expect(values).toContain(status);
    }
  });

  it('binds a "submitted" flag per member: absent -> false; explicit null -> true + null', async () => {
    const values = (await statementOf()).sql.values;
    // The eight (flag, value) pairs are bound first, in contract order, after the practice and id.
    const pairs = values.slice(2, 18);

    expect(pairs).toStrictEqual([
      false,
      null,
      true,
      '2026-07-18',
      true,
      null,
      false,
      null,
      false,
      null,
      true,
      'KAR',
      false,
      null,
      false,
      null,
    ]);
  });
});
