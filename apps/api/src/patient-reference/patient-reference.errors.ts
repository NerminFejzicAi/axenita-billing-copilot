/**
 * The two failures `GET /api/v1/patient-references/{id}` is allowed to produce of its own.
 *
 * Normative sources: `03` §8 (the frozen error-code catalogue), §9 (status usage), §11
 * (`MALFORMED_PATIENT_REFERENCE_ID = 400 VALIDATION_ERROR`,
 * `CROSS_TENANT_PATIENT_REFERENCE_GET = 404 RESOURCE_NOT_FOUND`); `09` §18.1 threat `T1`;
 * D-073 `OD-P5-I4A-2`; `08` §12.10 points 5-6 and §12.10a points 8-14.
 *
 * NO NEW ERROR CODE IS INTRODUCED, AND NONE MAY BE. `VALIDATION_ERROR` and `RESOURCE_NOT_FOUND`
 * both already exist in the frozen catalogue of `03` §8; D-073 states the requirement in so many
 * words ("nikakav novi error kod").
 *
 * Every rejection of this route that is NOT one of these two is produced somewhere else and is
 * unchanged by this slice: `401` by the authentication guard, `403 ACCESS_DENIED` and the two
 * `400 PRACTICE_CONTEXT_*` refusals by the shared tenant admission chain.
 *
 * The details are static and carry nothing from the request. They name no identifier, no
 * practice, no table, no row count and no SQL, so neither can become an oracle and neither can
 * carry a tenant fact into a log line (`09` §11, `03` §1).
 */

import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../common/errors/api-exception.js';

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
