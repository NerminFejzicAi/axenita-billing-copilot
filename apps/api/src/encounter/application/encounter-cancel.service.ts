/**
 * `POST /api/v1/encounters/{encounterId}/cancel` — encounter cancel (`P5-I5D`).
 *
 * Normative sources: `03` §3.7.1, §4, §8, §12 (the D-089 frozen contract); `09` §11, §12.2,
 * §18.1; D-054 clauses 6–12; D-062 part F.3; D-069; D-072; D-089 `RULING B` … `RULING H`.
 *
 * THE ORDER (D-089 `RULING E`), and nothing is judged before the caller is admitted:
 *
 *     BEGIN                                           (ONE interactive transaction)
 *   1-2   bearer verified, user resolved             DevelopmentAuthGuard + IdentityBootstrap
 *   3-10  X-Practice-ID, practice, membership,       TenantRequestPipeline (shared, unchanged)
 *         set_request_context, encounter.cancel
 *         ---- everything below is reachable ONLY by a fully authorised caller ----
 *    3    encounterId                                400, before any encounter statement
 *    4    Idempotency-Key                            400, before any lock, claim or hash
 *   5-10  body, reason, well-formedness, raw bytes,  422, before the hash
 *         sanitizer, final limits
 *   11    request_sha256 over the ORIGINAL body      never the sanitised body, never the path
 *   12    IdempotencyService.runOnce, BOUND to the encounter:
 *           advisory lock / claim inspection / resource binding / claim
 *   13      -> THE ONE atomic cancel statement      404 / 409 INVALID_STATE_TRANSITION / ok
 *   14      -> ENCOUNTER_CANCELLED audit            {status, version} x2, {reason: sanitised}
 *   15      -> completion (200)
 *     COMMIT
 *
 * NO `If-Match`: a stray header is not read and `VERSION_CONFLICT` cannot be produced here. NO
 * PRE-READ and NO POST-UPDATE READ on the first execution: the outcome, the previous values and
 * the projection all come from step 13. Any failure after BEGIN rolls back EVERYTHING — claim,
 * encounter and audit row — because nothing on this path catches and continues.
 *
 * THE RAW REASON never leaves the request: it is validated, hashed as part of the original body
 * and sanitised, and only the sanitised value is handed on — to the audit metadata, and nowhere
 * else. Nothing here logs.
 */

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { type EncounterCreatedResponseDto, type Permission } from '@axenita/contracts';

import { AuditWriterService } from '../../audit/application/audit-writer.service.js';
import { getRequestId } from '../../common/request-context/request-context.storage.js';
import { type JsonValue } from '../../crypto/json-canonicalizer.js';
import { requestSha256 } from '../../crypto/request-sha256.js';
import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import { TenantDatabaseService } from '../../database/tenant-database.service.js';
import { IdentityBootstrapService } from '../../identity/application/identity-bootstrap.service.js';
import { isUuid } from '../../identity/application/practice-context.js';
import { TenantRequestPipeline } from '../../identity/application/tenant-request.pipeline.js';
import { IdempotencyService } from '../../idempotency/application/idempotency.service.js';
import { validateIdempotencyKey } from '../../idempotency/domain/idempotency-key.js';
import { IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL } from '../../idempotency/idempotency.constants.js';
import { invalidEncounterStateTransition } from '../domain/encounter-state-transition.error.js';
import {
  encounterIdentifierInvalid,
  encounterNotFound,
  encounterUpdateFailed,
} from '../encounter.errors.js';
import { ENCOUNTER_CANCELLED_STATUS } from '../infrastructure/encounter-database.port.js';
import { EncounterDatabase } from '../infrastructure/encounter.database.js';
import { validateEncounterCancelCommand } from './encounter-cancel-command.js';
import { projectEncounterCreated } from './encounter-projection.js';

/** `03` §12, `15` §5 — held by `PHYSICIAN` only; the matrix is not touched here. */
const REQUIRED_PERMISSION: Permission = 'encounter.cancel';

/** Everything one cancel request supplies. Every member is untrusted until proven otherwise. */
export interface EncounterCancelRequest {
  /** The subject of an already verified bearer credential. */
  readonly verifiedAuthSubject: string;
  /** The raw `X-Practice-ID` value, or `undefined`. */
  readonly practiceContextHeader: string | undefined;
  /** The raw `{encounterId}` path segment. */
  readonly encounterId: string;
  /** The raw `Idempotency-Key` value, or `undefined`. */
  readonly idempotencyKeyHeader: string | undefined;
  /** The parsed JSON body, untouched — validated after authorisation and hashed as it is. */
  readonly body: unknown;
}

/** The closed `200` document — the SAME seven-member projection as create and `PATCH`. */
export type EncounterCancelRepresentation = EncounterCreatedResponseDto;

@Injectable()
export class EncounterCancelService {
  public constructor(
    private readonly identityBootstrap: IdentityBootstrapService,
    private readonly tenantRequests: TenantRequestPipeline,
    private readonly tenantDatabase: TenantDatabaseService,
    private readonly encounters: EncounterDatabase,
    private readonly idempotency: IdempotencyService,
    private readonly auditWriter: AuditWriterService,
  ) {}

  public async cancelEncounter(
    request: EncounterCancelRequest,
  ): Promise<EncounterCancelRepresentation> {
    return this.identityBootstrap.runAuthenticatedSession(
      request.verifiedAuthSubject,
      async (session, user) => {
        // Steps 1 and 2 through the ONE shared pipeline. Nothing below runs for a caller who does
        // not hold `encounter.cancel` in the admitted practice.
        const admitted = await this.tenantRequests.admit(session, {
          scope: { mode: 'HEADER_ONLY' },
          practiceContextHeader: request.practiceContextHeader,
          requiredPermission: REQUIRED_PERMISSION,
        });

        // Step 3 — static, reflects nothing, and no encounter or idempotency statement has run.
        if (!isUuid(request.encounterId)) {
          throw encounterIdentifierInvalid();
        }

        // The validator accepts either case, PostgreSQL renders lowercase. The resource binding
        // compares against the cached (PostgreSQL-rendered) pointer, so it is normalised once,
        // here: an uppercase spelling of the same encounter is the same resource, not a conflict.
        const encounterId = request.encounterId.toLowerCase();

        // Step 4 — the header, strictly before the body, the hash and the lock.
        const idempotencyKey = validateIdempotencyKey(request.idempotencyKeyHeader);

        // Steps 5 to 10 — nothing that fails them is hashed or reaches a statement. In particular
        // a lone surrogate is refused here and never reaches the JCS canonicaliser.
        const command = await validateEncounterCancelCommand(request.body);

        // Step 11 — over the ORIGINAL parsed body (`03` §4.1): not the sanitised reason, not the
        // path, not an entity tag.
        const digest = requestSha256(request.body as JsonValue);

        const tenant = this.tenantDatabase.forAdmittedRequest(session, admitted);

        // ONE application instant: claim, expiry, completion and the audit `occurred_at`. The
        // encounter's `updated_at` is the database clock (`clock_timestamp()`).
        const instant = new Date();

        // Step 12.
        return this.idempotency.runOnce(
          tenant,
          {
            scope: {
              practiceId: admitted.practiceId,
              userId: user.id,
              endpoint: IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL,
              idempotencyKey,
            },
            requestSha256: digest,
            claimId: randomUUID(),
            instant,
            boundResourceId: encounterId,
          },
          {
            execute: async () => {
              // Step 13 — THE ONE atomic statement.
              const result = await this.encounters.cancelEncounter(tenant, {
                encounterId,
                updatedBy: user.id,
              });

              switch (result.outcome) {
                case 'NOT_FOUND':
                  // Nonexistent and cross-tenant: one answer, from one empty set.
                  throw encounterNotFound();
                case 'INVALID_STATE_TRANSITION':
                  // Visible, but not a phase 5 cancel source — `CANCELLED` and `CLOSED` included.
                  throw invalidEncounterStateTransition();
                case 'INCONSISTENT':
                  throw encounterUpdateFailed();
                case 'CANCELLED':
                  break;
              }

              const { projection, previousStatus, previousVersion } = result.applied;

              // Step 14 — in THIS transaction. A failure propagates and rolls the cancel and the
              // claim back with it.
              await this.auditWriter.recordEncounterCancelled(tenant, {
                id: randomUUID(),
                practiceId: admitted.practiceId,
                actorUserId: user.id,
                resourceId: projection.id,
                occurredAt: instant,
                requestId: getRequestId() ?? null,
                previousStatus,
                previousVersion,
                newStatus: ENCOUNTER_CANCELLED_STATUS,
                newVersion: projection.version,
                reason: command.reason,
              });

              return { resourceId: projection.id, result: projectEncounterCreated(projection) };
            },

            // The replay is a read of the CURRENT canonical state through the SAME projection
            // statement — no second cancel and no second audit event, structurally. `CANCELLED`
            // is terminal, so the current resource is the original answer.
            replay: async (resourceId: string) => this.readRepresentation(tenant, resourceId),
          },
        );
      },
    );
  }

  private async readRepresentation(
    tenant: AdmittedTenantSession,
    encounterId: string,
  ): Promise<EncounterCancelRepresentation | undefined> {
    const row = await this.encounters.findProjection(tenant, encounterId);

    return row === undefined ? undefined : projectEncounterCreated(row);
  }
}
