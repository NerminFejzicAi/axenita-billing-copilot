import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type Response } from 'express';

import { API_VERSION_1, type EncounterCreatedResponseDto } from '@axenita/contracts';

import { IDEMPOTENCY_KEY_HEADER_NAME } from '../../idempotency/idempotency.constants.js';
import { PRACTICE_CONTEXT_HEADER_NAME } from '../../identity/application/practice-context.js';
import {
  DevelopmentAuthGuard,
  readVerifiedAuthSubject,
  type AuthenticatedRequest,
} from '../../identity/authentication/development-auth.guard.js';
import { authenticationRequired } from '../../identity/identity.errors.js';
import { EncounterCreateService } from '../application/encounter-create.service.js';
import { encounterEntityTag } from '../application/encounter-projection.js';
import { EncounterUpdateService } from '../application/encounter-update.service.js';

const ETAG_HEADER_NAME = 'ETag';

const IF_MATCH_HEADER_NAME = 'If-Match';

/**
 * `POST /api/v1/encounters` (`03` §12; D-085, `P5-I5B`) and
 * `PATCH /api/v1/encounters/{encounterId}` (`03` §12; D-087, `P5-I5C`) — and nothing else.
 *
 * `GET` list/detail and `cancel` belong to later slices and are not registered, stubbed or
 * anticipated here, so every such path stays `404` at the router.
 *
 * Route class "tenant", `HEADER_ONLY`: `X-Practice-ID` is the only source of the practice identity.
 * Authentication is the same `DevelopmentAuthGuard` every tenant route uses.
 *
 * THE CONTROLLER IS THIN. It forwards the verified subject, the two raw headers and the raw parsed
 * body, and sets the one header the contract requires. There is no `@Body()` parameter, for the
 * reason the patient-reference write path records: a global parameter pipe would judge the body
 * BEFORE the caller is admitted, which `03` §3.7.1 forbids, and the ORIGINAL parsed body is what
 * `request_sha256` is taken over.
 */
@Controller({ path: 'encounters', version: API_VERSION_1 })
@UseGuards(DevelopmentAuthGuard)
export class EncountersController {
  public constructor(
    private readonly encounterCreate: EncounterCreateService,
    private readonly encounterUpdate: EncounterUpdateService,
  ) {}

  /**
   * `201` with the closed seven-member document and a strong `ETag` equal to its `version` —
   * `"1"` for an original create, the current version for a replay (`OD-D085-17`). A refused
   * request never reaches the header line and carries no entity tag.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async createEncounter(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EncounterCreatedResponseDto> {
    const verifiedAuthSubject = readVerifiedAuthSubject(request);

    if (verifiedAuthSubject === undefined) {
      // Unreachable while the guard is attached; fail closed if it is ever removed.
      throw authenticationRequired();
    }

    const representation = await this.encounterCreate.createEncounter({
      verifiedAuthSubject,
      practiceContextHeader: request.header(PRACTICE_CONTEXT_HEADER_NAME),
      idempotencyKeyHeader: request.header(IDEMPOTENCY_KEY_HEADER_NAME),
      // The parsed body, untouched.
      body: request.body,
    });

    // Set explicitly, before serialisation, so Express does not substitute a weak content hash.
    response.setHeader(ETAG_HEADER_NAME, encounterEntityTag(representation));

    return representation;
  }

  /**
   * `200` with the closed seven-member document and the NEW strong `ETag` — both from the row the
   * ONE atomic update returned (D-087 `OD-P5-I5C-4`). A refused request never reaches the header
   * line and carries no entity tag.
   *
   * `Idempotency-Key` is deliberately not read: `PATCH` ignores a stray one (`OD-P5-I5C-5`).
   */
  @Patch(':encounterId')
  @HttpCode(HttpStatus.OK)
  public async updateEncounter(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('encounterId') encounterId: string,
  ): Promise<EncounterCreatedResponseDto> {
    const verifiedAuthSubject = readVerifiedAuthSubject(request);

    if (verifiedAuthSubject === undefined) {
      // Unreachable while the guard is attached; fail closed if it is ever removed.
      throw authenticationRequired();
    }

    const representation = await this.encounterUpdate.updateEncounter({
      verifiedAuthSubject,
      practiceContextHeader: request.header(PRACTICE_CONTEXT_HEADER_NAME),
      // Raw: validated after admission, never reflected.
      encounterId,
      // RAW, and NOT normalised — absent (`428`) and empty (`400`) stay different (D-055).
      ifMatchHeader: request.header(IF_MATCH_HEADER_NAME),
      // The parsed body, untouched.
      body: request.body,
    });

    response.setHeader(ETAG_HEADER_NAME, encounterEntityTag(representation));

    return representation;
  }
}
