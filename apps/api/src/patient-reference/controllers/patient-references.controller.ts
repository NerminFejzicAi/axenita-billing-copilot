import { Controller, Get, HttpCode, HttpStatus, Param, Req, UseGuards } from '@nestjs/common';

import { API_VERSION_1, type PatientReferenceResponseDto } from '@axenita/contracts';

import { PRACTICE_CONTEXT_HEADER_NAME } from '../../identity/application/practice-context.js';
import {
  DevelopmentAuthGuard,
  readVerifiedAuthSubject,
  type AuthenticatedRequest,
} from '../../identity/authentication/development-auth.guard.js';
import { authenticationRequired } from '../../identity/identity.errors.js';
import { PatientReferenceReadService } from '../application/patient-reference-read.service.js';

/**
 * `GET /api/v1/patient-references/{id}` (`03` §11; D-072 `OD-P5-I4-13`; D-073).
 *
 * Route class "tenant" (`03` §3.4) with `PATIENT_REFERENCE_GET_TENANT_SCOPE = HEADER_ONLY`:
 * `X-Practice-ID` is mandatory and is the ONLY place the practice identity comes from, because
 * the path carries none. Authentication is the SAME already-reviewed `DevelopmentAuthGuard` the
 * identity routes use — there is no second authentication mechanism and no second token
 * verification anywhere in this phase.
 *
 * The controller is thin, as `00` §9 requires: it forwards the verified subject, the raw path
 * segment and the raw header to the application service and returns the service's document. It
 * runs no query, opens no transaction, validates no identifier and maps no database row. In
 * particular it does NOT validate `{id}` here and does NOT validate `X-Practice-ID` here —
 * `03` §3.7.1 puts both strictly after the current user has been resolved and admitted, and the
 * order may not be reordered. No `ParseUUIDPipe` is attached, and D-073 explicitly declines to
 * make one a canonical requirement.
 *
 * THIS CONTROLLER OWNS EXACTLY ONE ROUTE. `@Get(':id')` matches a SINGLE path segment. There is
 * no `POST` — `POST /patient-references` belongs to `P5-I4C` and is not registered by this class
 * or by any other — no `PATCH`, no `DELETE`, no lookup-by-pseudonym route and no
 * lookup-by-external-reference route (the two service-level lookups of `P5-I4C` introduce no
 * HTTP route at all, D-072 `OD-P5-I4-14`). Every such path therefore stays `404` at the router.
 *
 * NO `Idempotency-Key` SEMANTICS AND NO `If-Match` SEMANTICS. This is a `GET`: it consumes no
 * idempotency key, writes no idempotency row, declares no version validator of its own, honours
 * no precondition and writes no audit event. `patient_references` is create-once/read-only in
 * phase 5 and carries no `version` column at all (`03` §11), so the strong `ETag` contract of the
 * settings routes has no counterpart here; the audit writer belongs to `P5-I4C`.
 */
@Controller({ path: 'patient-references', version: API_VERSION_1 })
@UseGuards(DevelopmentAuthGuard)
export class PatientReferencesController {
  public constructor(private readonly patientReferenceRead: PatientReferenceReadService) {}

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  public async patientReference(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<PatientReferenceResponseDto> {
    const verifiedAuthSubject = readVerifiedAuthSubject(request);

    if (verifiedAuthSubject === undefined) {
      // Unreachable while the guard is attached, and deliberately fail closed rather than
      // fall back to any other subject if it ever is removed.
      throw authenticationRequired();
    }

    return this.patientReferenceRead.loadPatientReference({
      verifiedAuthSubject,
      resourceId: id,
      // Express resolves header names case-insensitively, so the canonical spelling of
      // `03` §3.2 is used verbatim. No alternative header name is read and no fallback exists.
      practiceContextHeader: request.header(PRACTICE_CONTEXT_HEADER_NAME),
    });
  }
}
