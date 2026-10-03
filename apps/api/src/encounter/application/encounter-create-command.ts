/**
 * Turns an untrusted parsed body of `POST /api/v1/encounters` into the validated create command.
 *
 * Normative sources: `03` §8, §12; D-085 `OD-D085-1` … `OD-D085-6`, `OD-D085-16`.
 *
 * THREE GATES, IN THIS ORDER, ALL BEFORE THE DIGEST AND BEFORE ANY STATEMENT:
 *
 * 1. ROOT SHAPE — a non-null, non-array object, decided explicitly;
 * 2. SCHEMA — the delayed `ValidationPipe` with the shared frozen options, so unknown members are
 *    REJECTED (`UNKNOWN_FIELD`), never stripped, at the root and inside every diagnosis;
 * 3. CROSS-ELEMENT DIAGNOSIS RULES — at most one primary, no duplicate `(codingSystem, code)`.
 *
 * Nothing that fails a gate is hashed, and nothing that fails a gate reaches the database.
 *
 * THE VALUES ARE READ FROM THE RAW PARSED BODY, NOT FROM THE DTO INSTANCE, for the reason the
 * patient-reference write path records: an instance may materialise an omitted member as an own
 * property holding `undefined`. Absent and explicit `null` both become SQL `NULL` here, while the
 * ORIGINAL body — in which they remain different — is what gets hashed (`OD-D085-1`).
 */

import { ValidationPipe } from '@nestjs/common';

import { API_VALIDATION_PIPE_OPTIONS } from '../../common/validation/validation-pipe-options.js';
import { CreateEncounterDto } from '../dto/create-encounter.dto.js';
import {
  duplicateDiagnoses,
  encounterCreationFailed,
  multiplePrimaryDiagnoses,
  requestBodyNotAnObject,
} from '../encounter.errors.js';

/** The same configuration as the global pipe, built from the same frozen constant. */
const createBodyValidator = new ValidationPipe(API_VALIDATION_PIPE_OPTIONS);

export interface ValidatedDiagnosis {
  readonly codingSystem: string;
  readonly code: string;
  readonly isPrimary: boolean;
}

export interface ValidatedEncounterCreateCommand {
  readonly patientReferenceId: string;
  readonly occurredAt: string;
  readonly treatmentDate: string;
  readonly responsiblePhysicianId: string | null;
  readonly guarantorType: string | null;
  readonly insuranceContext: string | null;
  readonly specialtyCode: string | null;
  readonly patientAgeAtEncounter: number | null;
  readonly patientSexAtEncounter: string | null;
  readonly sourceSystem: string;
  readonly diagnoses: readonly ValidatedDiagnosis[];
}

export async function validateEncounterCreateCommand(
  body: unknown,
): Promise<ValidatedEncounterCreateCommand> {
  // Gate 1.
  if (!isPlainObject(body)) {
    throw requestBodyNotAnObject();
  }

  // Gate 2. Throws the repository's standard `422 VALIDATION_ERROR` document. The result is
  // deliberately discarded — it answers "is every submitted value acceptable?" and nothing else.
  await createBodyValidator.transform(body, { type: 'body', metatype: CreateEncounterDto });

  const diagnoses = readDiagnoses(body);

  // Gate 3.
  if (diagnoses.filter((diagnosis) => diagnosis.isPrimary).length > 1) {
    throw multiplePrimaryDiagnoses();
  }

  // EXACT pair equality — no case folding, no trimming, no normalisation (`OD-D085-4`). A JSON
  // array key makes the pair unambiguous whatever characters either member contains.
  const pairs = new Set(
    diagnoses.map((diagnosis) => JSON.stringify([diagnosis.codingSystem, diagnosis.code])),
  );

  if (pairs.size !== diagnoses.length) {
    throw duplicateDiagnoses();
  }

  return {
    patientReferenceId: readString(body, 'patientReferenceId'),
    occurredAt: readString(body, 'occurredAt'),
    treatmentDate: readString(body, 'treatmentDate'),
    responsiblePhysicianId: readNullableString(body, 'responsiblePhysicianId'),
    guarantorType: readNullableString(body, 'guarantorType'),
    insuranceContext: readNullableString(body, 'insuranceContext'),
    specialtyCode: readNullableString(body, 'specialtyCode'),
    patientAgeAtEncounter: readNullableNumber(body, 'patientAgeAtEncounter'),
    patientSexAtEncounter: readNullableString(body, 'patientSexAtEncounter'),
    sourceSystem: readString(body, 'sourceSystem'),
    diagnoses,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDiagnoses(body: Record<string, unknown>): readonly ValidatedDiagnosis[] {
  const value = body['diagnoses'];

  if (!Array.isArray(value)) {
    // UNREACHABLE over HTTP: gate 2 proved this. Reaching here means the gates disagree, which is
    // a defect in this file — so it becomes the shared static `500`, never a guessed value.
    throw encounterCreationFailed();
  }

  return value.map((element: unknown): ValidatedDiagnosis => {
    if (!isPlainObject(element)) {
      throw encounterCreationFailed();
    }

    const isPrimary = element['isPrimary'];

    if (typeof isPrimary !== 'boolean') {
      throw encounterCreationFailed();
    }

    return {
      codingSystem: readString(element, 'codingSystem'),
      code: readString(element, 'code'),
      isPrimary,
    };
  });
}

/** A member gate 2 has already proven to be a present, non-null string. */
function readString(source: Record<string, unknown>, field: string): string {
  const value = source[field];

  if (typeof value !== 'string') {
    // Unreachable for the reason above; fail closed for the reason above.
    throw encounterCreationFailed();
  }

  return value;
}

/** A nullable string member: absent and explicit `null` are both SQL `NULL`. */
function readNullableString(source: Record<string, unknown>, field: string): string | null {
  const value = source[field];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw encounterCreationFailed();
  }

  return value;
}

/** A nullable integer member: absent and explicit `null` are both SQL `NULL`. */
function readNullableNumber(source: Record<string, unknown>, field: string): number | null {
  const value = source[field];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'number') {
    throw encounterCreationFailed();
  }

  return value;
}
