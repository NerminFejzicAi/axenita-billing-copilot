/**
 * The failures the two patient-reference routes are allowed to produce of their own.
 *
 * Normative sources: `03` §8 (the frozen error-code catalogue), §8.1 (the conflict mapping),
 * §9 (status usage), §11 (`MALFORMED_PATIENT_REFERENCE_ID = 400 VALIDATION_ERROR`,
 * `CROSS_TENANT_PATIENT_REFERENCE_GET = 404 RESOURCE_NOT_FOUND`, the `P5-I4` create
 * clarifications); `09` §9, §11 and §18.1 threat `T1`; D-062 part D; D-070; D-072 `OD-P5-I4-1`,
 * `OD-P5-I4-2` and `OD-P5-I4-10`; D-073 `OD-P5-I4A-2`; D-079 `RULING D`; `08` §12.10 points 5-6,
 * §12.10a points 8-14 and §12.12 obligations 7-9, 11 and 18.
 *
 * NO NEW ERROR CODE IS INTRODUCED, AND NONE MAY BE. `VALIDATION_ERROR`, `RESOURCE_NOT_FOUND`,
 * `PATIENT_REFERENCE_ALREADY_EXISTS` and `INTERNAL_ERROR` all already exist in the frozen
 * catalogue of `03` §8 — the third of them added there by D-072 and mapped to `409` for exactly
 * this route by §8.1.
 *
 * Every rejection of these routes that is NOT listed here is produced somewhere else and is
 * unchanged by this slice: `401` by the authentication guard, `403 ACCESS_DENIED` and the two
 * `400 PRACTICE_CONTEXT_*` refusals by the shared tenant admission chain, the two `400`
 * `Idempotency-Key` refusals and the three `409` idempotency refusals by the idempotency module,
 * and the field-level `422` document by the shared validation pipe.
 *
 * The details are static and carry nothing from the request. They name no identifier, no external
 * reference, no pseudonym, no keyed token, no practice, no table, no row count, no constraint, no
 * SQLSTATE and no SQL, so none can become an oracle and none can carry a tenant fact into a log
 * line (`09` §11, `03` §1).
 */

import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../common/errors/api-exception.js';
import { detailForStatus } from '../common/problem-details/problem-details.factory.js';

/**
 * The `{id}` path segment is not a syntactically valid resource identifier
 * (`MALFORMED_PATIENT_REFERENCE_ID = 400 VALIDATION_ERROR`, D-073 `OD-P5-I4A-2`).
 *
 * `400`, because the fault is the FORMAT OF A REQUEST, which `03` §9 classifies as `400`. It is
 * emphatically not part of the protected `404` pair below: a malformed identifier is knowable
 * BEFORE any query over the resource, so refusing it discloses nothing about the existence of
 * any row, in this practice or in another (`MALFORMED_RESOURCE_UUID_DB_READS = 0`).
 *
 * THE DETAIL IS STATIC AND THE IDENTIFIER IS NEVER REFLECTED — not whole, not truncated, not as
 * a prefix and not as a suffix. Echoing even a fragment would turn a rejection into a mirror for
 * crafted input (`09` §11).
 *
 * NO `errors[]` MEMBER. This is a path-format refusal, not the `422` body-schema document of
 * `03` §8, so it carries no field-level list; D-073 forbids "namjenski field error" introduced
 * for this case in particular. The body shape is therefore identical for every malformed input.
 */
export function resourceIdentifierInvalid(): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.BAD_REQUEST,
    detail: 'The requested resource identifier is not valid.',
  });
}

/**
 * The requested resource is not available to this caller — the PROTECTED `404` (D-073;
 * `03` §11; `09` §18.1 `T1`).
 *
 * ONE FACTORY, ONE SEMANTIC PATH, TWO CAUSES. A valid identifier that names no row at all and a
 * valid identifier that names a row of ANOTHER practice must be observably indistinguishable:
 * identical body, identical code, identical title, identical detail, identical field order and
 * identical headers. That is achieved here by construction rather than by discipline — there is
 * exactly one factory and exactly one call site, so the two causes are not merely answered the
 * same way, they are not separable in the first place.
 *
 * NO CROSS-TENANT-SPECIFIC ERROR EXISTS AND NONE MAY BE ADDED. Nor is there a discriminating
 * pre-read: the tenant-scoped statement returns zero rows for both causes and the application
 * never asks a second question that could tell them apart. A caller must not be able to infer
 * that a patient reference exists in a practice they do not belong to.
 */
export function patientReferenceNotFound(): ApiException {
  return new ApiException({
    code: 'RESOURCE_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    detail: 'The requested resource was not found.',
  });
}

/**
 * The request body is not a JSON object (`03` §8, §9).
 *
 * `422`, and the SAME document the schema pipe produces for a semantically invalid body minus the
 * field list: a body that is `null`, a bare array, a number or a string carries none of the four
 * required members, so "one or more fields are invalid" is exactly what happened. It is not `400`
 * — the JSON parsed successfully, and `03` §9 reserves `400` for a format fault.
 *
 * IT IS CHECKED EXPLICITLY RATHER THAN LEFT TO EMERGE from `class-transformer`'s handling of odd
 * roots, for the same reason the settings write path checks it: the answer for such a body must be
 * a decision this code took, not a side effect of a library.
 */
export function requestBodyNotAnObject(): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail: 'One or more fields are invalid.',
  });
}

/**
 * `externalPatientReference` was refused by the MANUAL-v1 normalisation profile
 * (`03` §11; D-070; `02` §2.8.5).
 *
 * ONE ANSWER FOR ALL EIGHT PROFILE RULES — ill-formed Unicode, `NUL`, a C0/C1 control, an empty
 * result after trimming, and the 255-UTF-8-byte ceiling among them. The profile's own rejection
 * reason is deliberately NOT rendered: it is a static literal and therefore safe in a server-side
 * message, but exposing WHICH rule a crafted identifier tripped turns the endpoint into a probe
 * for the normalisation pipeline.
 *
 * THE SUBMITTED VALUE IS NEVER REFLECTED — not whole, not truncated, not as a prefix, not as a
 * byte count. A rejected external reference is still a patient identifier (`09` §9, §11), and
 * D-062 part D requires the message to be generic and static.
 *
 * NO `errors[]` MEMBER, so the body is identical for every rejected identifier whatever was wrong
 * with it.
 */
export function externalPatientReferenceInvalid(): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail: 'One or more fields are invalid.',
  });
}

/**
 * The canonical external reference already exists in this practice — `409`
 * (`03` §8, §8.1, §11; D-072 `OD-P5-I4-10`; D-079 `RULING D`).
 *
 * The ONLY trigger is a unique violation of `patient_references_source_external_ref_key`,
 * `unique (practice_id, source_system, external_patient_ref_hash)`, learned from the database and
 * from nothing else: there is NO existence pre-read on this path, for the external reference or
 * for the pseudonym (`03` §11, "Nema pre-read oracle-a").
 *
 * WHAT THIS RESPONSE DELIBERATELY DOES NOT DO
 *
 * - it does NOT fall back to a successful `200`;
 * - it does NOT disclose one field of the existing row — not `id`, not `pseudonym`, not
 *   `createdAt`, not `birthYear`, not `sexCode`;
 * - it does NOT reuse `IDEMPOTENCY_CONFLICT`, which is a different fault about a different
 *   subject (the same key with a different body) and which D-072 forbids collapsing this into.
 *
 * The detail is static and reflects neither the submitted identifier nor its keyed token.
 */
export function patientReferenceAlreadyExists(): ApiException {
  return new ApiException({
    code: 'PATIENT_REFERENCE_ALREADY_EXISTS',
    status: HttpStatus.CONFLICT,
    detail: 'A patient reference for this external reference already exists.',
  });
}

/**
 * The creation could not be completed — `500 INTERNAL_ERROR` with a STATIC, non-PHI body
 * (`03` §11; D-072 `OD-P5-I4-1`, `OD-P5-I4-2`; D-079 `RULING D`).
 *
 * TWO CAUSES, ONE INDISTINGUISHABLE ANSWER:
 *
 * - `PSEUDONYM_INSERT_MAX_ATTEMPTS` candidates were all refused by
 *   `patient_references_pseudonym_key`. With a CSPRNG over `32^10` candidates this is
 *   astronomically unlikely and is treated as a broken invariant rather than as a routine
 *   outcome — there is deliberately no deterministic fallback pseudonym, which would make the
 *   value derivable;
 * - the insert raised a unique violation this contract does not recognise. Any `23505` other
 *   than the two canonically mapped indexes is an internal failure, never a guessed mapping.
 *
 * NOTHING ABOUT THE ATTEMPTS IS OBSERVABLE. Not a candidate pseudonym, not the attempt number,
 * not the collision count, not the constraint name, and not the elapsed time as a deliberate
 * signal. The detail is taken from the shared `500` mapping, so the body is byte-identical to an
 * unhandled failure and the two cannot be told apart from outside.
 */
export function patientReferenceCreationFailed(): ApiException {
  return new ApiException({
    code: 'INTERNAL_ERROR',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: detailForStatus(HttpStatus.INTERNAL_SERVER_ERROR),
  });
}
