import { describe, expect, it } from 'vitest';

import { ApiException } from '../../common/errors/api-exception.js';
import {
  isRfc3339DateTimeWithZone,
  isStrictCalendarDate,
  MAX_ENCOUNTER_DIAGNOSES,
} from '../dto/create-encounter.dto.js';
import { validateEncounterCreateCommand } from './encounter-create-command.js';

/**
 * `P5-I5B` request validation (D-085 `OD-D085-1` … `OD-D085-6`, `OD-D085-16`).
 *
 * Every refusal below must be the canonical `422 VALIDATION_ERROR` and must happen BEFORE the
 * service hashes the body or issues a statement — this function is the whole of that gate.
 */

const PATIENT = '9b2f1e43-6a0f-4c1d-8f3e-5d6c7b8a9e01';
const PHYSICIAN = '22222222-2222-4222-8222-222222222001';

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientReferenceId: PATIENT,
    occurredAt: '2026-07-17T08:30:00+02:00',
    treatmentDate: '2026-07-17',
    responsiblePhysicianId: PHYSICIAN,
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

function minimalBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientReferenceId: PATIENT,
    occurredAt: '2026-07-17T06:30:00Z',
    treatmentDate: '2026-07-17',
    sourceSystem: 'MANUAL',
    diagnoses: [],
    ...overrides,
  };
}

function without(body: Record<string, unknown>, member: string): Record<string, unknown> {
  const copy = { ...body };
  delete copy[member];
  return copy;
}

async function expectValidationError(body: unknown): Promise<ApiException> {
  const failure: unknown = await validateEncounterCreateCommand(body).then(
    () => undefined,
    (error: unknown) => error,
  );

  expect(failure).toBeInstanceOf(ApiException);
  const exception = failure as ApiException;
  expect(exception.code).toBe('VALIDATION_ERROR');
  expect(exception.getStatus()).toBe(422);
  expect(exception.detail).toBe('One or more fields are invalid.');

  return exception;
}

function fieldCodes(exception: ApiException): readonly string[] {
  return (exception.errors ?? []).map((error) => `${error.field}:${error.code}`);
}

describe('validateEncounterCreateCommand — accepted bodies', () => {
  it('accepts the canonical full body and reads every member from it', async () => {
    await expect(validateEncounterCreateCommand(validBody())).resolves.toStrictEqual({
      patientReferenceId: PATIENT,
      occurredAt: '2026-07-17T08:30:00+02:00',
      treatmentDate: '2026-07-17',
      responsiblePhysicianId: PHYSICIAN,
      guarantorType: 'KVG',
      insuranceContext: 'AMBULATORY',
      specialtyCode: 'AIM',
      patientAgeAtEncounter: 58,
      patientSexAtEncounter: 'F',
      sourceSystem: 'MANUAL',
      diagnoses: [{ codingSystem: 'ICD-10', code: 'I10', isPrimary: true }],
    });
  });

  it('accepts every optional nullable member ABSENT and maps each to null', async () => {
    const command = await validateEncounterCreateCommand(minimalBody());

    expect(command).toMatchObject({
      responsiblePhysicianId: null,
      guarantorType: null,
      insuranceContext: null,
      specialtyCode: null,
      patientAgeAtEncounter: null,
      patientSexAtEncounter: null,
      diagnoses: [],
    });
  });

  it('accepts every optional nullable member as explicit null', async () => {
    const command = await validateEncounterCreateCommand(
      minimalBody({
        responsiblePhysicianId: null,
        guarantorType: null,
        insuranceContext: null,
        specialtyCode: null,
        patientAgeAtEncounter: null,
        patientSexAtEncounter: null,
      }),
    );

    expect(command.responsiblePhysicianId).toBeNull();
    expect(command.patientAgeAtEncounter).toBeNull();
  });

  it('accepts exactly 50 diagnoses, zero or one primary, and age bounds 0 and 130', async () => {
    const diagnoses = Array.from({ length: MAX_ENCOUNTER_DIAGNOSES }, (_, index) => ({
      codingSystem: 'ICD-10',
      code: `C${String(index)}`,
      isPrimary: index === 7,
    }));

    await expect(validateEncounterCreateCommand(minimalBody({ diagnoses }))).resolves.toMatchObject(
      { diagnoses: expect.any(Array) as unknown },
    );
    await expect(
      validateEncounterCreateCommand(
        minimalBody({ diagnoses: [{ codingSystem: 'ICD-10', code: 'I10', isPrimary: false }] }),
      ),
    ).resolves.toBeDefined();
    await expect(
      validateEncounterCreateCommand(minimalBody({ patientAgeAtEncounter: 0 })),
    ).resolves.toBeDefined();
    await expect(
      validateEncounterCreateCommand(minimalBody({ patientAgeAtEncounter: 130 })),
    ).resolves.toBeDefined();
  });

  it('accepts the same code under two different coding systems (only the exact pair is unique)', async () => {
    await expect(
      validateEncounterCreateCommand(
        minimalBody({
          diagnoses: [
            { codingSystem: 'ICD-10', code: 'I10', isPrimary: false },
            { codingSystem: 'ICD-10-GM', code: 'I10', isPrimary: false },
            { codingSystem: 'ICD-10', code: 'i10', isPrimary: false },
          ],
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('accepts interior spaces and non-ASCII letters (no over-reach of the hygiene rule)', async () => {
    await expect(
      validateEncounterCreateCommand(
        minimalBody({ insuranceContext: 'Ambulant Zürich', specialtyCode: 'Allg. Innere' }),
      ),
    ).resolves.toBeDefined();
  });
});

describe('validateEncounterCreateCommand — refused bodies (422 VALIDATION_ERROR)', () => {
  it('refuses a non-object root', async () => {
    for (const body of [undefined, null, [], 'x', 1, true]) {
      await expectValidationError(body);
    }
  });

  it('refuses an unknown root member as UNKNOWN_FIELD', async () => {
    const exception = await expectValidationError(validBody({ notes: 'free text' }));

    expect(fieldCodes(exception)).toContain('notes:UNKNOWN_FIELD');
  });

  it('refuses diagnosis description and diagnosisType as UNKNOWN_FIELD', async () => {
    for (const extra of [{ description: 'Hypertonie' }, { diagnosisType: 'MAIN' }]) {
      const exception = await expectValidationError(
        validBody({
          diagnoses: [{ codingSystem: 'ICD-10', code: 'I10', isPrimary: true, ...extra }],
        }),
      );

      expect(fieldCodes(exception).some((entry) => entry.endsWith(':UNKNOWN_FIELD'))).toBe(true);
    }
  });

  it('refuses every required member when absent or null', async () => {
    for (const member of [
      'patientReferenceId',
      'occurredAt',
      'treatmentDate',
      'sourceSystem',
      'diagnoses',
    ]) {
      await expectValidationError(without(validBody(), member));
      await expectValidationError(validBody({ [member]: null }));
    }
  });

  it('refuses an empty required string', async () => {
    for (const member of ['patientReferenceId', 'occurredAt', 'treatmentDate', 'sourceSystem']) {
      await expectValidationError(validBody({ [member]: '' }));
    }
  });

  it('refuses an empty PRESENT optional string', async () => {
    for (const member of [
      'responsiblePhysicianId',
      'guarantorType',
      'insuranceContext',
      'specialtyCode',
      'patientSexAtEncounter',
    ]) {
      await expectValidationError(validBody({ [member]: '' }));
    }
  });

  it('refuses an empty diagnosis codingSystem or code', async () => {
    await expectValidationError(
      validBody({ diagnoses: [{ codingSystem: '', code: 'I10', isPrimary: true }] }),
    );
    await expectValidationError(
      validBody({ diagnoses: [{ codingSystem: 'ICD-10', code: '', isPrimary: true }] }),
    );
  });

  it('refuses any sourceSystem other than MANUAL', async () => {
    for (const sourceSystem of ['AXENITA', 'CSV', 'FHIR', 'OTHER', 'manual', 'MANUAL ', 1]) {
      await expectValidationError(validBody({ sourceSystem }));
    }
  });

  it('refuses 51 diagnoses', async () => {
    const diagnoses = Array.from({ length: MAX_ENCOUNTER_DIAGNOSES + 1 }, (_, index) => ({
      codingSystem: 'ICD-10',
      code: `C${String(index)}`,
      isPrimary: false,
    }));

    await expectValidationError(minimalBody({ diagnoses }));
  });

  it('refuses more than one primary diagnosis', async () => {
    const exception = await expectValidationError(
      minimalBody({
        diagnoses: [
          { codingSystem: 'ICD-10', code: 'I10', isPrimary: true },
          { codingSystem: 'ICD-10', code: 'E11', isPrimary: true },
        ],
      }),
    );

    expect(fieldCodes(exception)).toStrictEqual(['diagnoses:INVALID_VALUE']);
  });

  it('refuses a duplicate exact (codingSystem, code) pair before persistence', async () => {
    const exception = await expectValidationError(
      minimalBody({
        diagnoses: [
          { codingSystem: 'ICD-10', code: 'I10', isPrimary: true },
          { codingSystem: 'ICD-10', code: 'I10', isPrimary: false },
        ],
      }),
    );

    expect(fieldCodes(exception)).toStrictEqual(['diagnoses:INVALID_VALUE']);
  });

  it('refuses malformed diagnosis elements and a non-array diagnoses member', async () => {
    for (const diagnoses of [
      [null],
      ['I10'],
      [[{ codingSystem: 'ICD-10', code: 'I10', isPrimary: true }]],
      [{ codingSystem: 'ICD-10', code: 'I10' }],
      [{ codingSystem: 'ICD-10', code: 'I10', isPrimary: 'true' }],
      [{ codingSystem: 'ICD-10', code: 'I10', isPrimary: null }],
      [{ codingSystem: null, code: 'I10', isPrimary: true }],
      { codingSystem: 'ICD-10', code: 'I10', isPrimary: true },
      'I10',
    ]) {
      await expectValidationError(minimalBody({ diagnoses }));
    }
  });

  it('refuses a non-integer or out-of-range patientAgeAtEncounter', async () => {
    for (const patientAgeAtEncounter of [58.5, '58', -1, 131, true, Number.MAX_SAFE_INTEGER]) {
      await expectValidationError(validBody({ patientAgeAtEncounter }));
    }
  });

  it('refuses a malformed patientReferenceId or responsiblePhysicianId', async () => {
    for (const value of ['not-a-uuid', `${PATIENT}x`, PATIENT.replaceAll('-', ''), 42]) {
      await expectValidationError(validBody({ patientReferenceId: value }));
      await expectValidationError(validBody({ responsiblePhysicianId: value }));
    }
  });

  it('refuses an occurredAt without a zone or otherwise not RFC 3339', async () => {
    for (const occurredAt of [
      '2026-07-17T08:30:00',
      '2026-07-17 08:30:00Z',
      '2026-07-17T08:30Z',
      '2026-07-17t08:30:00z',
      '2026-07-17',
      '2026-02-30T08:30:00Z',
      '2026-07-17T24:00:00Z',
      '2026-07-17T08:60:00Z',
      '2026-07-17T08:30:60Z',
      '2026-07-17T08:30:00+2:00',
      '2026-07-17T08:30:00+0200',
      '2026-07-17T08:30:00+24:00',
      '2026-07-17T08:30:00.Z',
      '0000-01-01T00:00:00Z',
      '9999-12-31T23:30:00-01:00',
      'yesterday',
      1752733800000,
    ]) {
      await expectValidationError(validBody({ occurredAt }));
    }
  });

  it('refuses a treatmentDate that is not a strict real YYYY-MM-DD date', async () => {
    for (const treatmentDate of [
      '2026-7-17',
      '2026-07-17T00:00:00Z',
      '17.07.2026',
      '2026-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-04-31',
      '0000-01-01',
      ' 2026-07-17',
      20260717,
    ]) {
      await expectValidationError(validBody({ treatmentDate }));
    }
  });

  it('refuses NUL, C0/C1 controls, CR, LF, TAB and outer white space in every string member', async () => {
    const hostile = [
      'A\u0000B',
      'A\u0001B',
      'A\u001fB',
      'A\u0085B',
      'A\u009fB',
      'A\rB',
      'A\nB',
      'A\tB',
      ' KVG',
      'KVG ',
      ' KVG',
      'KVG ',
      '\ud800KVG',
    ];

    for (const value of hostile) {
      for (const member of [
        'guarantorType',
        'insuranceContext',
        'specialtyCode',
        'patientSexAtEncounter',
      ]) {
        await expectValidationError(validBody({ [member]: value }));
      }

      await expectValidationError(
        validBody({ diagnoses: [{ codingSystem: value, code: 'I10', isPrimary: true }] }),
      );
      await expectValidationError(
        validBody({ diagnoses: [{ codingSystem: 'ICD-10', code: value, isPrimary: true }] }),
      );
    }
  });

  it('refuses a string longer than its column, counted in characters', async () => {
    await expectValidationError(validBody({ guarantorType: 'G'.repeat(31) }));
    await expectValidationError(validBody({ patientSexAtEncounter: 'S'.repeat(21) }));
    await expectValidationError(
      validBody({ diagnoses: [{ codingSystem: 'C'.repeat(31), code: 'I10', isPrimary: true }] }),
    );
    // Thirty astral characters are thirty characters for `varchar(30)`, though sixty code units.
    await expect(
      validateEncounterCreateCommand(validBody({ guarantorType: '\u{1F600}'.repeat(30) })),
    ).resolves.toBeDefined();
  });

  it('never echoes a submitted value in any message', async () => {
    const marker = 'SECRET-MARKER-P5I5B';
    const exception = await expectValidationError(
      validBody({ guarantorType: ` ${marker}`, unknownMember: marker }),
    );

    expect(JSON.stringify(exception.errors)).not.toContain(marker);
  });
});

describe('date predicates', () => {
  it('accepts Z, numeric offsets, -00:00 and fractional seconds', () => {
    for (const value of [
      '2026-07-17T06:30:00Z',
      '2026-07-17T08:30:00+02:00',
      '2026-07-17T01:30:00-05:00',
      '2026-07-17T06:30:00-00:00',
      '2026-07-17T06:30:00.1Z',
      '2026-07-17T06:30:00.123456789+01:00',
      '2024-02-29T00:00:00Z',
      '0001-01-01T00:00:00Z',
      '9999-12-31T23:59:59.999Z',
    ]) {
      expect([value, isRfc3339DateTimeWithZone(value)]).toStrictEqual([value, true]);
    }
  });

  it('accepts real leap days and refuses unreal ones', () => {
    expect(isStrictCalendarDate('2024-02-29')).toBe(true);
    expect(isStrictCalendarDate('2000-02-29')).toBe(true);
    expect(isStrictCalendarDate('1900-02-29')).toBe(false);
    expect(isStrictCalendarDate('0001-01-01')).toBe(true);
  });
});
