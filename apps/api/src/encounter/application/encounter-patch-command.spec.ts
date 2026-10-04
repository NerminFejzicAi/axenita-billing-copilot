import { describe, expect, it } from 'vitest';

import { ApiException } from '../../common/errors/api-exception.js';
import { type EncounterPatchAssignments } from '../infrastructure/encounter-database.port.js';
import {
  ENCOUNTER_PATCH_MUTABLE_FIELDS,
  validateEncounterPatchCommand,
} from './encounter-patch-command.js';

/**
 * The request gates of `PATCH /api/v1/encounters/{encounterId}` (D-087 `OD-P5-I5C-5`): root
 * shape, schema (unknown AND forbidden members), presence, absent/`null` semantics and the reused
 * `P5-I5B` value rules. The database half lives in `test/phase5-encounter-patch.security.ts`.
 */

const UNCHANGED: EncounterPatchAssignments = {
  occurredAt: undefined,
  treatmentDate: undefined,
  responsiblePhysicianId: undefined,
  guarantorType: undefined,
  insuranceContext: undefined,
  specialtyCode: undefined,
  patientAgeAtEncounter: undefined,
  patientSexAtEncounter: undefined,
};

async function refusal(body: unknown): Promise<ApiException> {
  try {
    await validateEncounterPatchCommand(body);
  } catch (error) {
    if (error instanceof ApiException) {
      return error;
    }

    throw error;
  }

  throw new Error('expected the body to be refused');
}

function problemOf(error: ApiException): Record<string, unknown> {
  return { code: error.code, detail: error.detail, errors: error.errors };
}

async function expectRefused(
  body: unknown,
  status: number,
): Promise<{ code: unknown; errors: unknown }> {
  const error = await refusal(body);
  const problem = problemOf(error);

  expect(error.getStatus()).toBe(status);

  return { code: problem['code'], errors: problem['errors'] };
}

describe('validateEncounterPatchCommand — the mutable surface', () => {
  it('names exactly the eight D-087 mutable members', () => {
    expect([...ENCOUNTER_PATCH_MUTABLE_FIELDS]).toStrictEqual([
      'occurredAt',
      'treatmentDate',
      'responsiblePhysicianId',
      'guarantorType',
      'insuranceContext',
      'specialtyCode',
      'patientAgeAtEncounter',
      'patientSexAtEncounter',
    ]);
  });

  it('accepts every member at once and carries the values verbatim', async () => {
    await expect(
      validateEncounterPatchCommand({
        occurredAt: '2026-07-18T09:15:00.123+02:00',
        treatmentDate: '2026-07-18',
        responsiblePhysicianId: '22222222-2222-4222-8222-222222222001',
        guarantorType: 'UVG',
        insuranceContext: 'STATIONARY',
        specialtyCode: 'KAR',
        patientAgeAtEncounter: 0,
        patientSexAtEncounter: 'M',
      }),
    ).resolves.toStrictEqual({
      occurredAt: '2026-07-18T09:15:00.123+02:00',
      treatmentDate: '2026-07-18',
      responsiblePhysicianId: '22222222-2222-4222-8222-222222222001',
      guarantorType: 'UVG',
      insuranceContext: 'STATIONARY',
      specialtyCode: 'KAR',
      patientAgeAtEncounter: 0,
      patientSexAtEncounter: 'M',
    });
  });

  it('maps an ABSENT member to undefined (unchanged) and touches nothing else', async () => {
    await expect(validateEncounterPatchCommand({ specialtyCode: 'AIM' })).resolves.toStrictEqual({
      ...UNCHANGED,
      specialtyCode: 'AIM',
    });
  });

  it.each([
    'responsiblePhysicianId',
    'guarantorType',
    'insuranceContext',
    'specialtyCode',
    'patientAgeAtEncounter',
    'patientSexAtEncounter',
  ])('maps an explicit null %s to null (SQL NULL), distinct from absent', async (field) => {
    await expect(validateEncounterPatchCommand({ [field]: null })).resolves.toStrictEqual({
      ...UNCHANGED,
      [field]: null,
    });
  });

  it.each(['occurredAt', 'treatmentDate'])(
    'refuses an explicit null %s with 422',
    async (field) => {
      const { code, errors } = await expectRefused({ [field]: null }, 422);

      expect(code).toBe('VALIDATION_ERROR');
      expect((errors as { field: string }[]).every((error) => error.field === field)).toBe(true);
    },
  );
});

describe('validateEncounterPatchCommand — refusals', () => {
  it.each([
    ['an array', []],
    ['null', null],
    ['a string', 'occurredAt'],
    ['a number', 7],
    ['undefined', undefined],
  ])('answers 422 for a non-object body (%s)', async (_name, body) => {
    const { code, errors } = await expectRefused(body, 422);

    expect(code).toBe('VALIDATION_ERROR');
    expect(errors).toBeUndefined();
  });

  it('answers 400 VALIDATION_ERROR for {} — no field to name', async () => {
    const { code, errors } = await expectRefused({}, 400);

    expect(code).toBe('VALIDATION_ERROR');
    expect(errors).toBeUndefined();
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
    'cancelReason',
    'patient',
    'notes',
  ])('refuses the forbidden / unknown member %s with 422 UNKNOWN_FIELD', async (field) => {
    const { errors } = await expectRefused({ specialtyCode: 'AIM', [field]: 'x' }, 422);

    expect(errors).toStrictEqual([
      { field, code: 'UNKNOWN_FIELD', message: expect.any(String) as unknown },
    ]);
  });

  it('refuses a body of ONLY forbidden members as 422, not as an empty patch', async () => {
    const { code } = await expectRefused({ status: 'CANCELLED' }, 422);

    expect(code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['a zone-less occurredAt', { occurredAt: '2026-07-17T08:30:00' }],
    ['a lower-case z occurredAt', { occurredAt: '2026-07-17T08:30:00z' }],
    ['a leap-second occurredAt', { occurredAt: '2026-06-30T23:59:60Z' }],
    ['an empty occurredAt', { occurredAt: '' }],
    ['a numeric occurredAt', { occurredAt: 1752733800000 }],
    ['an unreal treatmentDate', { treatmentDate: '2026-02-30' }],
    ['a non-strict treatmentDate', { treatmentDate: '2026-7-17' }],
    ['a date-time treatmentDate', { treatmentDate: '2026-07-17T00:00:00Z' }],
    ['an age above 130', { patientAgeAtEncounter: 131 }],
    ['a negative age', { patientAgeAtEncounter: -1 }],
    ['a fractional age', { patientAgeAtEncounter: 58.5 }],
    ['a string age', { patientAgeAtEncounter: '58' }],
    ['an empty optional string', { guarantorType: '' }],
    ['a leading space', { specialtyCode: ' AIM' }],
    ['a trailing space', { specialtyCode: 'AIM ' }],
    ['a line feed', { insuranceContext: 'AMBU\nLATORY' }],
    ['a carriage return', { insuranceContext: 'AMBU\rLATORY' }],
    ['a tab', { patientSexAtEncounter: 'F\tX' }],
    ['a NUL', { guarantorType: 'K\u0000VG' }],
    ['a C1 control', { guarantorType: 'K\u0085VG' }],
    ['a lone surrogate', { specialtyCode: 'A\uD800M' }],
    ['a 31-code-point guarantorType', { guarantorType: 'G'.repeat(31) }],
    ['a 31-code-point insuranceContext', { insuranceContext: 'I'.repeat(31) }],
    ['a 51-code-point specialtyCode', { specialtyCode: 'S'.repeat(51) }],
    ['a 21-code-point patientSexAtEncounter', { patientSexAtEncounter: 'X'.repeat(21) }],
    ['a malformed physician UUID', { responsiblePhysicianId: 'not-a-uuid' }],
    ['a numeric physician id', { responsiblePhysicianId: 7 }],
  ])('answers 422 for %s', async (_name, body) => {
    const { code } = await expectRefused(body, 422);

    expect(code).toBe('VALIDATION_ERROR');
  });

  it('measures the length limits in code points, exactly as create does', async () => {
    // 30 astral code points = 60 UTF-16 units: accepted, because `varchar(30)` counts characters.
    await expect(
      validateEncounterPatchCommand({ guarantorType: '\u{1F600}'.repeat(30) }),
    ).resolves.toMatchObject({ guarantorType: '\u{1F600}'.repeat(30) });
  });

  it('accepts the inclusive age bounds 0 and 130', async () => {
    await expect(
      validateEncounterPatchCommand({ patientAgeAtEncounter: 130 }),
    ).resolves.toMatchObject({ patientAgeAtEncounter: 130 });
  });

  it('does not trim and does not echo a refused value', async () => {
    const error = await refusal({ specialtyCode: ' SECRET-MARKER ' });

    expect(JSON.stringify(problemOf(error))).not.toContain('SECRET-MARKER');
  });
});
