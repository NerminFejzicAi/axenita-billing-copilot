import { Controller, Get, HttpCode, HttpStatus, Param, Req, Res, UseGuards } from '@nestjs/common';
import { type Response } from 'express';

import { API_VERSION_1, type PracticeSettingsResponseDto } from '@axenita/contracts';

import { PRACTICE_CONTEXT_HEADER_NAME } from '../application/practice-context.js';
import { PracticeSettingsReadService } from '../application/practice-settings-read.service.js';
import {
  DevelopmentAuthGuard,
  readVerifiedAuthSubject,
  type AuthenticatedRequest,
} from '../authentication/development-auth.guard.js';
import { authenticationRequired } from '../identity.errors.js';

/** The canonical response header carrying the resource version (D-053 clause A.2). */
const ETAG_HEADER_NAME = 'ETag';

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
 * ONLY `GET` IS REGISTERED. `PATCH /practices/{practiceId}/settings` belongs to a later slice and
 * is deliberately not registered here, not even as a stub, so it stays `404` — a stub would have
 * to answer something, and every answer it could give would be a contract this phase has not
 * accepted (D-053 clause B.4).
 */
@Controller({ path: 'practices', version: API_VERSION_1 })
@UseGuards(DevelopmentAuthGuard)
export class PracticeSettingsController {
  public constructor(private readonly practiceSettingsRead: PracticeSettingsReadService) {}

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
}
