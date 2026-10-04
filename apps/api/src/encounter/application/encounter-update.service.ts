/**
 * `PATCH /api/v1/encounters/{encounterId}` — encounter patch / optimistic concurrency (`P5-I5C`).
 *
 * Normative sources: `03` §3.7.1, §5, §8.1, §9, §10, §12 (the D-087 current contract); D-054
 * clauses 6–12; D-055 (the `If-Match` parser and the optimistic-update precedent); D-069
 * `RULING 2`; D-082 (audit minimisation); D-085 `OD-D085-4` … `-6`, `-10`, `-16`, `-17`; D-087
 * `OD-P5-I5C-1` … `OD-P5-I5C-8`.
 *
 * THE ORDER (D-087 `OD-P5-I5C-6`, `-7`):
 *
 *     BEGIN                                           (ONE interactive transaction)
 *   1-2   bearer verified, user resolved             DevelopmentAuthGuard + IdentityBootstrap
 *   3-10  X-Practice-ID, practice, membership,       TenantRequestPipeline (shared, unchanged)
 *         set_request_context, encounter.update
 *         ---- everything below is reachable ONLY by a fully authorised caller ----
 *   11a   encounterId                                400, before any encounter statement
 *   11b   If-Match (D-055 parser, AS-IS)             428 absent / 400 malformed
 *   11c   body: shape, schema, presence              422 / 422 / 400
 *   11d   THE ONE atomic optimistic statement        409 VERSION_CONFLICT / 409 INVALID_STATE_
 *                                                    TRANSITION / 422 physician FK / updated
 *   11e   ENCOUNTER_UPDATED audit                    the minimised diff from 11d
 *     COMMIT
 *
 * NO `Idempotency-Key`: a stray header is not read, and the idempotency machinery is not invoked.
 * NO PRE-READ and NO POST-UPDATE READ: outcome, old values, new values and the projection all come
 * from 11d. Any failure after BEGIN rolls back everything, because nothing on this path catches
 * and continues, opens a savepoint or starts a second transaction.
 */

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { type EncounterCreatedResponseDto, type Permission } from '@axenita/contracts';

import { AuditWriterService } from '../../audit/application/audit-writer.service.js';
import { getRequestId } from '../../common/request-context/request-context.storage.js';
import { type JsonObject, type JsonValue } from '../../crypto/json-canonicalizer.js';
import { TenantDatabaseService } from '../../database/tenant-database.service.js';
import { IdentityBootstrapService } from '../../identity/application/identity-bootstrap.service.js';
import { isUuid } from '../../identity/application/practice-context.js';
import { parseIfMatchVersion } from '../../identity/application/practice-settings-if-match.js';
import { TenantRequestPipeline } from '../../identity/application/tenant-request.pipeline.js';
import { versionConflict } from '../../identity/identity.errors.js';
import { invalidEncounterStateTransition } from '../domain/encounter-state-transition.error.js';
import {
  encounterIdentifierInvalid,
  encounterUpdateFailed,
  responsiblePhysicianNotAssignable,
} from '../encounter.errors.js';
import {
  ResponsiblePhysicianNotAssignableError,
  type EncounterMutableField,
  type EncounterMutableValues,
  type EncounterPatchApplied,
  type EncounterPatchResult,
} from '../infrastructure/encounter-database.port.js';
import { EncounterDatabase } from '../infrastructure/encounter.database.js';
import {
  ENCOUNTER_PATCH_MUTABLE_FIELDS,
  validateEncounterPatchCommand,
} from './encounter-patch-command.js';
import { projectEncounterCreated } from './encounter-projection.js';

/** `03` §12, `15` §5 — held by `PHYSICIAN` and `MPA` only; the matrix is not touched here. */
const REQUIRED_PERMISSION: Permission = 'encounter.update';

/** Everything one `PATCH` request supplies. Every member is untrusted until proven otherwise. */
export interface EncounterUpdateRequest {
  /** The subject of an already verified bearer credential. */
  readonly verifiedAuthSubject: string;
  /** The raw `X-Practice-ID` value, or `undefined`. */
  readonly practiceContextHeader: string | undefined;
  /** The raw `{encounterId}` path segment. */
  readonly encounterId: string;
  /** The raw `If-Match` value — `undefined` (absent) and `''` stay different facts. */
  readonly ifMatchHeader: string | undefined;
  /** The parsed JSON body, untouched. */
  readonly body: unknown;
}

/**
 * The closed `200` document — the SAME seven-member projection the create route returns
 * (D-087 `OD-P5-I5C-4`; `OD-D085-17`), so the same contract type and the same projection function.
 */
export type EncounterRepresentation = EncounterCreatedResponseDto;

/** One member's value in its audit representation (D-087 `OD-P5-I5C-3`). */
function auditValue(values: EncounterMutableValues, field: EncounterMutableField): JsonValue {
  if (field === 'occurredAt') {
    // UTC, millisecond precision, terminal `Z`.
    return values.occurredAt.toISOString();
  }

  return values[field];
}

/**
 * The MINIMISED audit diff: exactly the `PATCH`-mutable members PostgreSQL reported as
 * `IS DISTINCT FROM` in the update statement, under their API camelCase names. Never `version`,
 * never an unchanged member, never a row snapshot (D-082; D-087 `OD-P5-I5C-3`). A value-no-op
 * yields `{}` / `{}`.
 */
export function buildEncounterUpdateDiff(applied: EncounterPatchApplied): {
  readonly previousValue: JsonObject;
  readonly newValue: JsonObject;
} {
  const previousValue: Record<string, JsonValue> = {};
  const newValue: Record<string, JsonValue> = {};

  for (const field of ENCOUNTER_PATCH_MUTABLE_FIELDS) {
    if (applied.changed[field]) {
      previousValue[field] = auditValue(applied.previous, field);
      newValue[field] = auditValue(applied.next, field);
    }
  }

  return { previousValue, newValue };
}

@Injectable()
export class EncounterUpdateService {
  public constructor(
    private readonly identityBootstrap: IdentityBootstrapService,
    private readonly tenantRequests: TenantRequestPipeline,
    private readonly tenantDatabase: TenantDatabaseService,
    private readonly encounters: EncounterDatabase,
    private readonly auditWriter: AuditWriterService,
  ) {}

  public async updateEncounter(request: EncounterUpdateRequest): Promise<EncounterRepresentation> {
    return this.identityBootstrap.runAuthenticatedSession(
      request.verifiedAuthSubject,
      async (session, user) => {
        // Steps 3 to 10 through the ONE shared pipeline. Nothing below runs for a caller who does
        // not hold `encounter.update` in the admitted practice.
        const admitted = await this.tenantRequests.admit(session, {
          scope: { mode: 'HEADER_ONLY' },
          practiceContextHeader: request.practiceContextHeader,
          requiredPermission: REQUIRED_PERMISSION,
        });

        // Step 11a — static, reflects nothing, and no encounter statement has run.
        if (!isUuid(request.encounterId)) {
          throw encounterIdentifierInvalid();
        }

        // Step 11b — the precondition, before the payload. `428` absent, `400` malformed or above
        // the `int4` domain; `"0"` passes here and becomes `409` below.
        const expectedVersion = parseIfMatchVersion(request.ifMatchHeader);

        // Step 11c — nothing that fails it reaches a statement.
        const assignments = await validateEncounterPatchCommand(request.body);

        const tenant = this.tenantDatabase.forAdmittedRequest(session, admitted);

        // Step 11d — THE ONE atomic optimistic statement.
        let result: EncounterPatchResult;

        try {
          result = await this.encounters.patchEncounter(tenant, {
            encounterId: request.encounterId,
            expectedVersion,
            updatedBy: user.id,
            assignments,
          });
        } catch (error) {
          if (error instanceof ResponsiblePhysicianNotAssignableError) {
            throw responsiblePhysicianNotAssignable();
          }

          throw error;
        }

        switch (result.outcome) {
          case 'VERSION_CONFLICT':
            // Nonexistent, tenant-invisible, stale, and stale + not patchable: ONE answer, and
            // never `404` (D-069 `RULING 2`; D-087 `OD-P5-I5C-2`).
            throw versionConflict();
          case 'INVALID_STATE_TRANSITION':
            // Only reachable when the SAME statement saw a visible row at the If-Match version.
            throw invalidEncounterStateTransition();
          case 'INCONSISTENT':
            throw encounterUpdateFailed();
          case 'UPDATED':
            break;
        }

        const { previousValue, newValue } = buildEncounterUpdateDiff(result.applied);

        // Step 11e — in THIS transaction. A failure propagates and rolls the update back with it.
        // `occurredAt` is the application instant (owner adjudication N-4).
        await this.auditWriter.recordEncounterUpdated(tenant, {
          id: randomUUID(),
          practiceId: admitted.practiceId,
          actorUserId: user.id,
          resourceId: result.applied.projection.id,
          occurredAt: new Date(),
          requestId: getRequestId() ?? null,
          previousValue,
          newValue,
        });

        return projectEncounterCreated(result.applied.projection);
      },
    );
  }
}
