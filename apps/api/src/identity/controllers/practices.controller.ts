import { Controller, Get, HttpCode, HttpStatus, Param, Req, UseGuards } from '@nestjs/common';

import { API_VERSION_1, type PracticeResponseDto } from '@axenita/contracts';

import { PRACTICE_CONTEXT_HEADER_NAME } from '../application/practice-context.js';
import { PracticeReadService } from '../application/practice-read.service.js';
import {
  DevelopmentAuthGuard,
  readVerifiedAuthSubject,
  type AuthenticatedRequest,
} from '../authentication/development-auth.guard.js';
import { authenticationRequired } from '../identity.errors.js';

/**
 * `GET /api/v1/practices/{practiceId}` (`03`, `04` §5.2, D-047 clauses 11 and 18).
 *
 * Route class "tenant" (`03` §3.4): `X-Practice-ID` is mandatory and must name the very practice
 * of the path. Authentication is the SAME already-reviewed `DevelopmentAuthGuard` that `/me`
 * uses — there is no second authentication mechanism and no second token verification anywhere
 * in this phase.
 *
 * The controller is thin, as `00` §9 requires: it forwards the verified subject, the raw path
 * segment and the raw header to the application service and returns the service's document. It
 * runs no query, opens no transaction, validates no identifier and maps no database row. In
 * particular it does NOT validate `X-Practice-ID` here — `03` §3.7.1 puts that at step 3, after
 * the current user has been resolved and admitted, and the order may not be reordered.
 *
 * THIS CONTROLLER OWNS EXACTLY ONE ROUTE. `@Get(':practiceId')` matches a SINGLE path segment, so
 * no settings path can reach this handler and this handler answers no settings path.
 * `GET /practices/{practiceId}/settings` is registered by `PracticeSettingsController`, which is
 * a separate class for exactly that reason: the accepted `GET /practices/{practiceId}` contract
 * and its permission are not edited to carry a second resource beneath them.
 * `PATCH /practices/{practiceId}/settings` is registered by that same separate class and is
 * likewise unreachable from here, for the same single-segment reason.
 */
@Controller({ path: 'practices', version: API_VERSION_1 })
@UseGuards(DevelopmentAuthGuard)
export class PracticesController {
  public constructor(private readonly practiceRead: PracticeReadService) {}

  @Get(':practiceId')
  @HttpCode(HttpStatus.OK)
  public async practice(
    @Req() request: AuthenticatedRequest,
    @Param('practiceId') practiceId: string,
  ): Promise<PracticeResponseDto> {
    const verifiedAuthSubject = readVerifiedAuthSubject(request);

    if (verifiedAuthSubject === undefined) {
      // Unreachable while the guard is attached, and deliberately fail closed rather than
      // fall back to any other subject if it ever is removed.
      throw authenticationRequired();
    }

    return this.practiceRead.loadPractice({
      verifiedAuthSubject,
      requestedPracticeId: practiceId,
      // Express resolves header names case-insensitively, so the canonical spelling of
      // `03` §3.2 is used verbatim. No alternative header name is read and no fallback exists.
      practiceContextHeader: request.header(PRACTICE_CONTEXT_HEADER_NAME),
    });
  }
}
