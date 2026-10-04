/**
 * The failures the encounter routes (`POST`, `P5-I5B`; `PATCH`, `P5-I5C`; `cancel`, `P5-I5D`)
 * produce of their own.
 *
 * Normative sources: `03` §8 (the frozen error-code catalogue), §9, §12 (D-069 `RULING 2`, the
 * D-085 current contract); `09` §11 and §18.1 threat `T1`; D-062 part D.5; D-085 `OD-D085-3`,
 * `OD-D085-10`.
 *
 * NO NEW ERROR CODE IS INTRODUCED. `VALIDATION_ERROR`, `RESOURCE_NOT_FOUND` and `INTERNAL_ERROR`
 * already exist. Every
 * other refusal of this route is produced elsewhere and is unchanged: `401` by the authentication
 * guard, `403` and the `400 PRACTICE_CONTEXT_*` refusals by the shared tenant admission chain,
 * the `400` `Idempotency-Key` refusals and the `409` idempotency refusals by the idempotency
 * module, and the field-level `422` document by the shared validation pipe.
 *
 * Every detail is static. None names an identifier, a pseudonym, a practice, a table, a
 * constraint, a SQLSTATE or a submitted value (`09` §11; D-062 part D).
 */

import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../common/errors/api-exception.js';
import { detailForStatus } from '../common/problem-details/problem-details.factory.js';

const INVALID_FIELDS_DETAIL = 'One or more fields are invalid.';

/** The request body is not a JSON object — `422`, exactly as the patient-reference write path. */
export function requestBodyNotAnObject(): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail: INVALID_FIELDS_DETAIL,
  });
}

/**
 * More than one diagnosis carries `isPrimary = true` (`OD-D085-3`).
 *
 * The field list names the collection and the existing fallback field code; it does not say
 * which elements were primary.
 */
export function multiplePrimaryDiagnoses(): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail: INVALID_FIELDS_DETAIL,
    errors: [
      {
        field: 'diagnoses',
        code: 'INVALID_VALUE',
        message: 'diagnoses must contain at most one primary diagnosis',
      },
    ],
  });
}

/**
 * Two diagnoses share the exact pair `(codingSystem, code)` (`OD-D085-3`).
 *
 * Refused BEFORE persistence. `encounter_diagnoses_encounter_code_key` stays the last line of
 * defence, and its `23505` would be an internal failure — it is deliberately never the route
 * by which this ordinary validation fault is detected.
 */
export function duplicateDiagnoses(): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail: INVALID_FIELDS_DETAIL,
    errors: [
      {
        field: 'diagnoses',
        code: 'INVALID_VALUE',
        message: 'diagnoses must not contain the same codingSystem and code more than once',
      },
    ],
  });
}

/**
 * `responsiblePhysicianId` is not assignable in the admitted practice (D-062 part D.5;
 * `OD-D085-10`).
 *
 * ONE ANSWER FOR THREE CAUSES — a user who is not a member of this practice, a user who is a
 * member of ANOTHER practice only, and an identifier naming no user at all. All three are learned
 * from `encounters_responsible_physician_membership_fk` and from nothing else: there is no
 * membership pre-read, so the causes are not merely answered alike, they are not separable here.
 * No field list, so the body is byte-identical whatever the cause.
 */
export function responsiblePhysicianNotAssignable(): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail: INVALID_FIELDS_DETAIL,
  });
}

/**
 * The creation could not be completed — the shared static `500 INTERNAL_ERROR`.
 *
 * Used only for states that are unreachable when the code is correct (the two validation gates
 * disagreeing, or the just-written row not being readable in the same transaction). Its body is
 * byte-identical to any unhandled failure, which is also the answer a cross-tenant or
 * nonexistent `patientReferenceId` receives (D-069 `RULING 2`).
 */
export function encounterCreationFailed(): ApiException {
  return new ApiException({
    code: 'INTERNAL_ERROR',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: detailForStatus(HttpStatus.INTERNAL_SERVER_ERROR),
  });
}

/**
 * The `{encounterId}` path segment of `PATCH /api/v1/encounters/{encounterId}` is not a
 * syntactically valid identifier — `400 VALIDATION_ERROR` (D-087 `OD-P5-I5C-6`).
 *
 * Decided AFTER authentication and tenant admission and BEFORE `If-Match`, the body and every
 * encounter statement. A malformed identifier is knowable without asking the database, so the
 * refusal discloses nothing about any row. The detail is static and the identifier is never
 * reflected, not whole and not in part; no `errors[]` member, because this is a path-format
 * refusal and not the `422` body-schema document — the patient-reference precedent (D-073).
 */
export function encounterIdentifierInvalid(): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.BAD_REQUEST,
    detail: 'The requested resource identifier is not valid.',
  });
}

/**
 * The update could not be completed — the shared static `500 INTERNAL_ERROR`.
 *
 * Used only for states that are unreachable when the code is correct (the validation gates
 * disagreeing, or the atomic `PATCH` statement reporting a visible, matching, patchable row that
 * it nevertheless did not update). Byte-identical to any unhandled failure.
 */
export function encounterUpdateFailed(): ApiException {
  return new ApiException({
    code: 'INTERNAL_ERROR',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: detailForStatus(HttpStatus.INTERNAL_SERVER_ERROR),
  });
}

/**
 * The cancel `reason` is not acceptable — `422 VALIDATION_ERROR` (D-089 `RULING B`, `RULING G`).
 *
 * ONE ANSWER FOR EVERY CAUSE the canonical sanitizer decides: a lone surrogate, a parsed string
 * above 255 UTF-8 bytes, a sanitised result that is empty, and a sanitised (NFC) result above 255
 * UTF-8 bytes. The field list names the member and nothing else. No raw value, no length, no
 * fragment of the sanitised value and no indication of WHICH rule failed: the reason is free text
 * that may carry personal data, and a refusal must not become a mirror for it (`09` §11, §12.2).
 */
export function cancelReasonInvalid(): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail: INVALID_FIELDS_DETAIL,
    errors: [{ field: 'reason', code: 'INVALID_VALUE', message: 'reason is not valid' }],
  });
}

/**
 * The encounter named by a cancel request is not visible in the admitted practice —
 * `404 RESOURCE_NOT_FOUND` (D-089 `RULING F`; D-069; `09` §18.1 threat `T1`).
 *
 * ONE FACTORY, TWO CAUSES. A nonexistent identifier and an identifier of ANOTHER practice are the
 * same empty set to the one tenant-scoped atomic cancel statement, so they are not merely answered
 * alike — there is no second question that could tell them apart. The detail is static and the
 * identifier is never reflected; the body is the patient-reference `404` document, byte for byte.
 */
export function encounterNotFound(): ApiException {
  return new ApiException({
    code: 'RESOURCE_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    detail: 'The requested resource was not found.',
  });
}
