import { Controller, Get, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';

import { API_VERSION_1, type MeResponseDto } from '@axenita/contracts';

import { IdentityBootstrapService } from '../application/identity-bootstrap.service.js';
import {
  DevelopmentAuthGuard,
  readVerifiedAuthSubject,
  type AuthenticatedRequest,
} from '../authentication/development-auth.guard.js';
import { authenticationRequired } from '../identity.errors.js';

/**
 * `GET /api/v1/me` (`03` §10).
 *
 * Route class "neutral" (`03` §3.4): authentication only. `X-Practice-ID` is not applicable, is
 * not read and is not required, and no tenant context is established — `set_request_context`,
 * `PracticeContextGuard` and `app.practice_id` all belong to phase 4.
 *
 * The controller is thin, as `00` §9 requires: it hands the verified subject to the application
 * service and returns the service's document. It runs no query, opens no transaction, and maps
 * no database row.
 */
@Controller({ path: 'me', version: API_VERSION_1 })
@UseGuards(DevelopmentAuthGuard)
export class MeController {
  public constructor(private readonly identityBootstrap: IdentityBootstrapService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  public async me(@Req() request: AuthenticatedRequest): Promise<MeResponseDto> {
    const verifiedAuthSubject = readVerifiedAuthSubject(request);

    if (verifiedAuthSubject === undefined) {
      // Unreachable while the guard is attached, and deliberately fail closed rather than
      // fall back to any other subject if it ever is removed.
      throw authenticationRequired();
    }

    return this.identityBootstrap.loadCurrentIdentity(verifiedAuthSubject);
  }
}
