import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';

import { API_VERSION_1, type PatientReferenceResponseDto } from '@axenita/contracts';

import { IDEMPOTENCY_KEY_HEADER_NAME } from '../../idempotency/idempotency.constants.js';
import { PRACTICE_CONTEXT_HEADER_NAME } from '../../identity/application/practice-context.js';
import {
  DevelopmentAuthGuard,
  readVerifiedAuthSubject,
  type AuthenticatedRequest,
} from '../../identity/authentication/development-auth.guard.js';
import { authenticationRequired } from '../../identity/identity.errors.js';
import { PatientReferenceCreateService } from '../application/patient-reference-create.service.js';
import { PatientReferenceReadService } from '../application/patient-reference-read.service.js';

/**
 * `GET /api/v1/patient-references/{id}` (`03` §11; D-072 `OD-P5-I4-13`; D-073) and
 * `POST /api/v1/patient-references` (`03` §4, §11; D-072; D-079).
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
 * THIS CONTROLLER OWNS EXACTLY TWO ROUTES (`P5-I4A` + `P5-I4C`). `@Get(':id')` matches a SINGLE
 * path segment and `@Post()` matches the collection. There is no `PATCH`, no `DELETE`, no
 * lookup-by-pseudonym route and no lookup-by-external-reference route — the two service-level
 * lookups of `P5-I4C` introduce no HTTP route at all (D-072 `OD-P5-I4-14`, D-079 `RULING B`).
 * Every such path therefore stays `404` at the router.
 *
 * THE `GET` IS UNCHANGED BY THE `P5-I4C` ADDITION. It consumes no idempotency key, writes no
 * idempotency row, declares no version validator, honours no precondition and writes no audit
 * event — `P5-I4` audit scope is `SUCCESSFUL_CREATE_ONLY` and a read produces no row at all
 * (`04` §7.5a.3). `patient_references` remains create-once/read-only in phase 5 with no `version`
 * column (`03` §11), so the strong `ETag` contract of the settings routes still has no
 * counterpart here.
 */
@Controller({ path: 'patient-references', version: API_VERSION_1 })
@UseGuards(DevelopmentAuthGuard)
export class PatientReferencesController {
  public constructor(
    private readonly patientReferenceRead: PatientReferenceReadService,
    private readonly patientReferenceCreate: PatientReferenceCreateService,
  ) {}

  /**
   * `POST /api/v1/patient-references` (`03` §4, §4.2 and §11; D-072; D-079).
   *
   * `201` on success, carrying the SAME canonical six-field document `GET` returns (D-062 part
   * H.1). The status is declared here rather than left to Nest's default for `@Post`, so it is a
   * stated contract instead of a framework convention.
   *
   * THERE IS NO `@Body()` PARAMETER, AND THAT IS DELIBERATE. A global Nest parameter pipe runs
   * BEFORE the controller method body and therefore before the tenant transaction exists, so a
   * `@Body()` here would answer an unauthorised caller with a field-level `422` describing a
   * resource they may not create — the exact inversion `03` §3.7.1 forbids. The raw parsed body
   * is forwarded instead and validated inside the transaction, after authorisation, exactly as
   * the settings write path does. Forwarding it unchanged is also what lets `request_sha256` be
   * taken over the ORIGINAL parsed value (`03` §4.2).
   *
   * The two headers are read with their canonical spellings (`03` §3.2, §4). Express resolves
   * header names case-insensitively, so no alternative name is read and no fallback exists.
   * Neither header is validated here: `03` §3.7.1 puts both strictly after the caller has been
   * resolved and admitted.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async createPatientReference(
    @Req() request: AuthenticatedRequest,
  ): Promise<PatientReferenceResponseDto> {
    const verifiedAuthSubject = readVerifiedAuthSubject(request);

    if (verifiedAuthSubject === undefined) {
      // Unreachable while the guard is attached, and deliberately fail closed rather than fall
      // back to any other subject if it ever is removed.
      throw authenticationRequired();
    }

    return this.patientReferenceCreate.createPatientReference({
      verifiedAuthSubject,
      practiceContextHeader: request.header(PRACTICE_CONTEXT_HEADER_NAME),
      idempotencyKeyHeader: request.header(IDEMPOTENCY_KEY_HEADER_NAME),
      // The parsed body, untouched. `undefined` and every non-object value travel on as they are:
      // the service decides what they mean, and nothing here collapses them.
      body: request.body,
    });
  }

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
