/**
 * Turns an untrusted parsed body of `PATCH /api/v1/encounters/{encounterId}` into the validated
 * assignments of the atomic update.
 *
 * Normative sources: `03` §8, §12 (the D-087 current contract); D-055 clause 14 (the empty-patch
 * precedent); D-085 `OD-D085-4` … `OD-D085-6`, `OD-D085-16`; D-087 `OD-P5-I5C-5`.
 *
 * THREE GATES, IN THIS ORDER, ALL BEFORE ANY ENCOUNTER STATEMENT:
 *
 * 1. ROOT SHAPE — a non-null, non-array object, else `422` (the create path's answer);
 * 2. SCHEMA — the delayed `ValidationPipe` with the shared frozen options, so every unknown AND
 *    every forbidden member (`status`, `patientReferenceId`, `sourceSystem`, `version`, ids,
 *    timestamps, `diagnoses`, cancel members) is REJECTED as `UNKNOWN_FIELD` (`422`);
 * 3. PRESENCE — at least one of the eight mutable members, else `400` (`{}` asks for nothing, so
 *    it must not consume a version — D-055 clause 14, D-087 `OD-P5-I5C-5`).
 *
 * PRESENCE IS READ FROM THE RAW PARSED BODY with `Object.hasOwn`, never from the DTO instance:
 * an instance may materialise an omitted member as an own property holding `undefined`, which
 * would turn "leave unchanged" into "write NULL".
 */

import { ValidationPipe } from '@nestjs/common';

import { API_VALIDATION_PIPE_OPTIONS } from '../../common/validation/validation-pipe-options.js';
import { patchBodyEmpty } from '../../identity/identity.errors.js';
import { PatchEncounterDto } from '../dto/patch-encounter.dto.js';
import { encounterUpdateFailed, requestBodyNotAnObject } from '../encounter.errors.js';
import { type EncounterPatchAssignments } from '../infrastructure/encounter-database.port.js';

/** The same configuration as the global pipe, built from the same frozen constant. */
const patchBodyValidator = new ValidationPipe(API_VALIDATION_PIPE_OPTIONS);

/** The eight `PATCH`-mutable members, in contract order (D-087 `OD-P5-I5C-5`). */
export const ENCOUNTER_PATCH_MUTABLE_FIELDS = [
  'occurredAt',
  'treatmentDate',
  'responsiblePhysicianId',
  'guarantorType',
  'insuranceContext',
  'specialtyCode',
  'patientAgeAtEncounter',
  'patientSexAtEncounter',
] as const satisfies readonly (keyof EncounterPatchAssignments)[];

export async function validateEncounterPatchCommand(
  body: unknown,
): Promise<EncounterPatchAssignments> {
  // Gate 1.
  if (!isPlainObject(body)) {
    throw requestBodyNotAnObject();
  }

  // Gate 2. Throws the repository's standard `422 VALIDATION_ERROR` document. The result is
  // deliberately discarded — it answers "is every submitted value acceptable?" and nothing else.
  await patchBodyValidator.transform(body, { type: 'body', metatype: PatchEncounterDto });

  // Gate 3.
  if (!ENCOUNTER_PATCH_MUTABLE_FIELDS.some((field) => Object.hasOwn(body, field))) {
    throw patchBodyEmpty();
  }

  return {
    occurredAt: readSubmittedString(body, 'occurredAt'),
    treatmentDate: readSubmittedString(body, 'treatmentDate'),
    responsiblePhysicianId: readSubmittedNullableString(body, 'responsiblePhysicianId'),
    guarantorType: readSubmittedNullableString(body, 'guarantorType'),
    insuranceContext: readSubmittedNullableString(body, 'insuranceContext'),
    specialtyCode: readSubmittedNullableString(body, 'specialtyCode'),
    patientAgeAtEncounter: readSubmittedNullableNumber(body, 'patientAgeAtEncounter'),
    patientSexAtEncounter: readSubmittedNullableString(body, 'patientSexAtEncounter'),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A non-nullable member: absent -> `undefined`; gate 2 already refused `null` and non-strings. */
function readSubmittedString(source: Record<string, unknown>, field: string): string | undefined {
  if (!Object.hasOwn(source, field)) {
    return undefined;
  }

  const value = source[field];

  if (typeof value !== 'string') {
    // UNREACHABLE over HTTP: gate 2 proved this. Reaching here means the gates disagree, which is
    // a defect in this file — so it becomes the shared static `500`, never a guessed value.
    throw encounterUpdateFailed();
  }

  return value;
}

/** A nullable member: absent -> `undefined` (unchanged); explicit `null` -> `null` (SQL NULL). */
function readSubmittedNullableString(
  source: Record<string, unknown>,
  field: string,
): string | null | undefined {
  if (!Object.hasOwn(source, field)) {
    return undefined;
  }

  const value = source[field];

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw encounterUpdateFailed();
  }

  return value;
}

/** A nullable integer member: absent -> `undefined`; explicit `null` -> `null`. */
function readSubmittedNullableNumber(
  source: Record<string, unknown>,
  field: string,
): number | null | undefined {
  if (!Object.hasOwn(source, field)) {
    return undefined;
  }

  const value = source[field];

  if (value === null) {
    return null;
  }

  if (typeof value !== 'number') {
    throw encounterUpdateFailed();
  }

  return value;
}
