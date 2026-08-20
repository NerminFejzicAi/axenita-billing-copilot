import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type Response } from 'express';

import { API_VERSION_1, type PracticeSettingsResponseDto } from '@axenita/contracts';

import { PRACTICE_CONTEXT_HEADER_NAME } from '../application/practice-context.js';
import { PracticeSettingsReadService } from '../application/practice-settings-read.service.js';
import { PracticeSettingsWriteService } from '../application/practice-settings-write.service.js';
import {
  DevelopmentAuthGuard,
  readVerifiedAuthSubject,
  type AuthenticatedRequest,
} from '../authentication/development-auth.guard.js';
import { authenticationRequired } from '../identity.errors.js';

/** The canonical response header carrying the resource version (D-053 clause A.2). */
const ETAG_HEADER_NAME = 'ETag';

/** The canonical spelling of the precondition header (`03` §5.2, D-055 clause 10). */
const IF_MATCH_HEADER_NAME = 'If-Match';

/**
 * The shape through which the untrusted parsed body is read.
 *
 * Express types `Request.body` as `any`, which would spread through every assignment that touched
 * it. Reading it through this interface pins it to `unknown` at the boundary, so the value cannot
 * be used as anything until the write service has proven what it is.
 */
interface RequestWithRawBody {
  readonly body?: unknown;
}

/**
 * `GET /api/v1/practices/{practiceId}/settings` (`03`, `04` §5.2, `15` §5, D-044, D-049, D-053).
 *
 * Route class "tenant" (`03` §3.4): `X-Practice-ID` is mandatory and must name the very practice
 * of the path. Authentication is the SAME already-reviewed `DevelopmentAuthGuard` that `/me` and
 * `GET /practices/{practiceId}` use — there is no second authentication mechanism and no second
 * token verification anywhere in this phase.
 *
 * The controller is thin, as `00` §9 requires: it forwards the verified subject, the raw path
 * segment and the raw header to the application service, sets the entity tag the service produced,
 * and returns the service's document. It runs no query, opens no transaction, reads no membership,
 * compares no role, validates no identifier, maps no database row and orchestrates no step of
 * `03` §3.7.1. In particular it does NOT validate `X-Practice-ID` here — §3.7.1 puts that at step
 * 3, after the current user has been resolved and admitted, and the order may not be reordered.
 *
 * NO IDENTITY IS FORWARDED (D-054 clause 12). The only thing resembling one that leaves this class
 * is the verified auth SUBJECT, which is the input to the authenticated bootstrap itself, never a
 * tenant-membership selector. No `userId` is read from the path, the query, the body or a header,
 * and none is passed on: the membership of this request is derived from `app.user_id` inside the
 * pinned transaction the service opens.
 *
 * WHY A SEPARATE CONTROLLER FROM `PracticesController`
 *
 * Both are mounted on `practices`, and Express matches `@Get(':practiceId')` against a SINGLE
 * segment, so `/practices/{id}/settings` cannot reach the practice handler and this handler
 * cannot answer `/practices/{id}`. Keeping the settings resource in its own class means the
 * accepted `GET /practices/{practiceId}` contract and its permission are not edited to add a
 * second resource beneath them, and the settings routes can grow their own slice without
 * reopening a frozen one.
 *
 * BOTH SETTINGS ROUTES ARE NOW REGISTERED, AND ONLY THOSE TWO. `GET` reads the frozen eight-field
 * representation (D-053 part A); `PATCH` writes it under optimistic concurrency (D-055 parts D to
 * G). No `PUT`, no `POST`, no `DELETE` and no sub-resource beneath `settings` exists, so each of
 * those remains `404` — a stub would have to answer something, and every answer it could give
 * would be a contract no accepted decision describes.
 *
 * NEITHER HANDLER USES `@Body()`, AND THE `PATCH` HANDLER MUST NOT (D-047, `03` §3.7.1)
 *
 * A `@Body() dto: PracticeSettingsPatchDto` parameter would be validated by the GLOBAL Nest
 * parameter pipe, which runs BEFORE the controller method body — and therefore before the
 * interactive transaction of D-047 clause 8 opens, before the caller is admitted, and before any
 * tenant barrier has been evaluated. An unknown, inactive, non-member or unauthorised caller
 * would then receive a field-level `422 errors[]` describing the schema of a resource they may
 * not touch, and the mandatory order of `03` §3.7.1 would be inverted by the framework rather
 * than by anyone's decision. The raw body is therefore forwarded untouched and validated inside
 * the transaction, after authorisation — see `PracticeSettingsWriteService`.
 */
@Controller({ path: 'practices', version: API_VERSION_1 })
@UseGuards(DevelopmentAuthGuard)
export class PracticeSettingsController {
  public constructor(
    private readonly practiceSettingsRead: PracticeSettingsReadService,
    private readonly practiceSettingsWrite: PracticeSettingsWriteService,
  ) {}

  /**
   * No caching directive is invented here: the entity tag exists for the optimistic-locking
   * contract of `03` §5.2, not as a cache validator this slice is entitled to design.
   *
   * `@Res({ passthrough: true })` gives the handler the response object for the ONE header it
   * must set while leaving Nest in charge of serialising and sending the body. Without
   * `passthrough` the framework would hand the whole response over and the return value would
   * never be sent at all.
   */
  @Get(':practiceId/settings')
  @HttpCode(HttpStatus.OK)
  public async settings(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('practiceId') practiceId: string,
  ): Promise<PracticeSettingsResponseDto> {
    const verifiedAuthSubject = readVerifiedAuthSubject(request);

    if (verifiedAuthSubject === undefined) {
      // Unreachable while the guard is attached, and deliberately fail closed rather than
      // fall back to any other subject if it ever is removed.
      throw authenticationRequired();
    }

    const result = await this.practiceSettingsRead.loadSettings({
      verifiedAuthSubject,
      requestedPracticeId: practiceId,
      // Express resolves header names case-insensitively, so the canonical spelling of
      // `03` §3.2 is used verbatim. No alternative header name is read and no fallback exists.
      practiceContextHeader: request.header(PRACTICE_CONTEXT_HEADER_NAME),
    });

    // The canonical strong tag of D-053 clause A.2, set EXPLICITLY and set here rather than left
    // to the framework. Express generates a weak, content-hashed `ETag` for a JSON response only
    // when none is present, so setting it before the body is serialised is what keeps the
    // resource's version — and not a hash of its rendering — in the header. The value is produced
    // by the service from the very row the body was projected from, so header and body can never
    // describe two different reads.
    //
    // A rejected request never reaches this line: `loadSettings` throws, the transaction rolls
    // back, and the Problem Details filter renders the refusal with no entity tag at all.
    response.setHeader(ETAG_HEADER_NAME, result.etag);

    return result.settings;
  }

  /**
   * `PATCH /api/v1/practices/{practiceId}/settings` (D-055 parts D to G).
   *
   * `200 OK` on success, with the SAME frozen eight-field document `GET` returns and a NEW strong
   * `ETag` (clause 22). `@HttpCode` is explicit because Nest would otherwise answer `200` for
   * `PATCH` by default anyway — stating it keeps the accepted status in the source rather than in
   * a framework default that could change.
   *
   * THIS METHOD IS THIN TO THE POINT OF BEING BORING, AND THAT IS THE CONTRACT. It reads four raw
   * values and forwards them. It does NOT parse `If-Match`, validate or coerce the body, convert
   * a version, open a transaction, query the database, resolve a membership, read roles, test for
   * `PRACTICE_ADMIN`, establish a tenant context or perform the `UPDATE`. Every one of those is a
   * step of `03` §3.7.1 with a fixed position in an order this layer cannot see, let alone
   * enforce.
   *
   * NO CALLER-SUPPLIED IDENTITY ENTERS THE PATH (D-054 clause 12). The only thing resembling one
   * that leaves this class is the verified auth SUBJECT, which is the input to the authenticated
   * bootstrap itself. No `userId` is read from the path, the query, the body or a header, and
   * none is passed on.
   *
   * `If-None-Match` IS NOT READ HERE (D-055 clause 24). It is canonised for `GET` revalidation
   * alone; on `PATCH` it neither substitutes for `If-Match` nor changes any outcome, and the way
   * to guarantee that is to never look at it.
   */
  @Patch(':practiceId/settings')
  @HttpCode(HttpStatus.OK)
  public async updateSettings(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('practiceId') practiceId: string,
  ): Promise<PracticeSettingsResponseDto> {
    const verifiedAuthSubject = readVerifiedAuthSubject(request);

    if (verifiedAuthSubject === undefined) {
      // Unreachable while the guard is attached, and deliberately fail closed rather than
      // fall back to any other subject if it ever is removed.
      throw authenticationRequired();
    }

    const result = await this.practiceSettingsWrite.updateSettings({
      verifiedAuthSubject,
      requestedPracticeId: practiceId,
      // Express resolves header names case-insensitively, so the canonical spellings of
      // `03` §3.2 and §5.2 are used verbatim. No alternative header name is read, and no
      // fallback exists for either.
      practiceContextHeader: request.header(PRACTICE_CONTEXT_HEADER_NAME),
      // RAW, and NOT normalised. `undefined` (header absent) and `''` (header present and empty)
      // are different facts with different answers — `428` and `400` — and D-055 clauses 10 to 12
      // freeze that distinction, so nothing here may trim, default or collapse the value.
      ifMatchHeader: request.header(IF_MATCH_HEADER_NAME),
      // The parsed body exactly as the body parser produced it, with no schema applied. The
      // double assertion is what discards Express's `any` typing: after it the value is `unknown`
      // and cannot be used as anything until the service proves what it is.
      body: (request as unknown as RequestWithRawBody).body,
    });

    // The NEW strong tag of D-055 clause 22, derived from the very row the `UPDATE` returned, and
    // set before the body is serialised so that Express does not substitute a weak content hash.
    // A refused request never reaches this line: the service throws, the transaction rolls back,
    // and the Problem Details filter renders the refusal with no entity tag at all.
    response.setHeader(ETAG_HEADER_NAME, result.etag);

    return result.settings;
  }
}
