/**
 * `POST /api/v1/encounters` — encounter create (`P5-I5B`).
 *
 * Normative sources: `03` §3.7.1, §4, §8, §9, §12 (the D-085 current contract and its corrective
 * addendum); `02` §7, §15.2, §15.4, §29.2; `09` §11, §18.1; D-054 clauses 6–12; D-062 parts D
 * and H.3; D-069 `RULING 2`; D-072; D-083 (creation is initialisation, not a transition); D-085
 * `OD-D085-1` … `OD-D085-17`.
 *
 * THE ORDER, AND WHY EVERY BOUNDARY IS WHERE IT IS — the patient-reference write path's order,
 * reused rather than re-derived:
 *
 *     BEGIN                                             (ONE interactive transaction)
 *   1-2   bearer verified, user resolved               DevelopmentAuthGuard + IdentityBootstrap
 *   3-10  X-Practice-ID, practice, membership,         TenantRequestPipeline (shared, unchanged)
 *         set_request_context, encounter.create
 *         ---- everything below is reachable ONLY by a fully authorised caller ----
 *   11a   Idempotency-Key validated                    400 before any lock, claim or hash
 *   11b-d body shape, schema, diagnosis rules          422 before any hash or statement
 *   11e   request_sha256 over the ORIGINAL body        absent and null stay distinct
 *   11f   IdempotencyService.runOnce, unchanged:
 *           advisory lock / claim inspection / claim
 *           -> INSERT encounter            (both composite FKs decide existence; no pre-read)
 *           -> INSERT diagnoses            (UNREVIEWED / MANUAL)
 *           -> projection read             (same-tenant pseudonym)
 *           -> ENCOUNTER_CREATED audit     ({status, version}, metadata {})
 *           -> completion
 *     COMMIT
 *
 * Any failure after BEGIN rolls back EVERYTHING — claim, encounter, diagnoses and audit row —
 * because nothing on this path catches and continues, opens a savepoint or starts a second
 * transaction (`OD-D085-11`).
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
import { TenantRequestPipeline } from '../../identity/application/tenant-request.pipeline.js';
import { IdempotencyService } from '../../idempotency/application/idempotency.service.js';
import { validateIdempotencyKey } from '../../idempotency/domain/idempotency-key.js';
import { IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS } from '../../idempotency/idempotency.constants.js';
import { ENCOUNTER_INITIAL_STATUS } from '../domain/encounter-state-machine.js';
import { encounterCreationFailed, responsiblePhysicianNotAssignable } from '../encounter.errors.js';
import { ResponsiblePhysicianNotAssignableError } from '../infrastructure/encounter-database.port.js';
import { EncounterDatabase } from '../infrastructure/encounter.database.js';
import {
  validateEncounterCreateCommand,
  type ValidatedEncounterCreateCommand,
} from './encounter-create-command.js';
import { projectEncounterCreated } from './encounter-projection.js';

/** `03` §12, `15` §5 — held by `PHYSICIAN` and `MPA` only; the matrix is not touched here. */
const REQUIRED_PERMISSION: Permission = 'encounter.create';

/** The persisted version of a newly created encounter (`OD-D085-17`; `encounters_version_check`). */
export const ENCOUNTER_INITIAL_VERSION = 1;

/** Everything one `POST` request supplies. Every member is untrusted until proven otherwise. */
export interface EncounterCreateRequest {
  /** The subject of an already verified bearer credential. */
  readonly verifiedAuthSubject: string;
  /** The raw `X-Practice-ID` value, or `undefined`. */
  readonly practiceContextHeader: string | undefined;
  /** The raw `Idempotency-Key` value, or `undefined`. */
  readonly idempotencyKeyHeader: string | undefined;
  /** The parsed JSON body, untouched — validated after authorisation and hashed as it is. */
  readonly body: unknown;
}

@Injectable()
export class EncounterCreateService {
  public constructor(
    private readonly identityBootstrap: IdentityBootstrapService,
    private readonly tenantRequests: TenantRequestPipeline,
    private readonly tenantDatabase: TenantDatabaseService,
    private readonly encounters: EncounterDatabase,
    private readonly idempotency: IdempotencyService,
    private readonly auditWriter: AuditWriterService,
  ) {}

  public async createEncounter(
    request: EncounterCreateRequest,
  ): Promise<EncounterCreatedResponseDto> {
    return this.identityBootstrap.runAuthenticatedSession(
      request.verifiedAuthSubject,
      async (session, user) => {
        // Steps 3 to 10 through the ONE shared pipeline. Nothing below runs for a caller who does
        // not hold `encounter.create` in the admitted practice.
        const admitted = await this.tenantRequests.admit(session, {
          scope: { mode: 'HEADER_ONLY' },
          practiceContextHeader: request.practiceContextHeader,
          requiredPermission: REQUIRED_PERMISSION,
        });

        // Step 11a — the header, strictly before the body, the hash and the lock.
        const idempotencyKey = validateIdempotencyKey(request.idempotencyKeyHeader);

        // Steps 11b to 11d — nothing that fails them is hashed or reaches a statement.
        const command = await validateEncounterCreateCommand(request.body);

        // Step 11e — over the ORIGINAL parsed body: no server default, no normalisation, and an
        // absent optional member and an explicit `null` hash differently (`OD-D085-7`).
        const digest = requestSha256(request.body as JsonValue);

        const tenant = this.tenantDatabase.forAdmittedRequest(session, admitted);

        // ONE instant: claim, expiry, completion, `created_at`, `updated_at` and the audit
        // `occurred_at` all describe the same moment.
        const instant = new Date();

        return this.idempotency.runOnce(
          tenant,
          {
            scope: {
              practiceId: admitted.practiceId,
              userId: user.id,
              endpoint: IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS,
              idempotencyKey,
            },
            requestSha256: digest,
            claimId: randomUUID(),
            instant,
          },
          {
            execute: async () => {
              const encounterId = await this.insertEncounter(
                tenant,
                admitted.practiceId,
                user.id,
                command,
                instant,
              );

              const representation = await this.readRepresentation(tenant, encounterId);

              if (representation === undefined) {
                // The row this transaction just wrote is not readable in it — a broken invariant,
                // answered with the shared static `500` and rolled back.
                throw encounterCreationFailed();
              }

              // In THIS transaction, after the rows genuinely exist. A failure propagates and
              // rolls the encounter, its diagnoses and the claim back with it.
              await this.auditWriter.recordEncounterCreated(tenant, {
                id: randomUUID(),
                practiceId: admitted.practiceId,
                actorUserId: user.id,
                resourceId: encounterId,
                occurredAt: instant,
                requestId: getRequestId() ?? null,
                status: ENCOUNTER_INITIAL_STATUS,
                version: ENCOUNTER_INITIAL_VERSION,
              });

              return { resourceId: encounterId, result: representation };
            },

            // The replay is a read of the CURRENT canonical state through the SAME projection
            // statement — no second INSERT and no second audit event, structurally (`OD-D085-7`).
            replay: async (resourceId: string) => this.readRepresentation(tenant, resourceId),
          },
        );
      },
    );
  }

  /**
   * The encounter INSERT and its diagnosis INSERTs.
   *
   * Creation INITIALISES `status` to {@link ENCOUNTER_INITIAL_STATUS}; it is not a graph edge,
   * so no transition guard is consulted and no `DRAFT -> DRAFT` edge is implied (D-083).
   *
   * Only `encounters_responsible_physician_membership_fk` is translated, into the generic `422`.
   * `encounters_patient_reference_fk` is not caught and becomes the shared static `500`
   * (D-069 `RULING 2`; `OD-D085-10`).
   */
  private async insertEncounter(
    tenant: AdmittedTenantSession,
    practiceId: string,
    userId: string,
    command: ValidatedEncounterCreateCommand,
    instant: Date,
  ): Promise<string> {
    const encounterId = randomUUID();

    try {
      await this.encounters.insertEncounter(tenant, {
        id: encounterId,
        practiceId,
        patientReferenceId: command.patientReferenceId,
        occurredAt: command.occurredAt,
        treatmentDate: command.treatmentDate,
        responsiblePhysicianId: command.responsiblePhysicianId,
        guarantorType: command.guarantorType,
        insuranceContext: command.insuranceContext,
        specialtyCode: command.specialtyCode,
        patientAgeAtEncounter: command.patientAgeAtEncounter,
        patientSexAtEncounter: command.patientSexAtEncounter,
        status: ENCOUNTER_INITIAL_STATUS,
        sourceSystem: command.sourceSystem,
        version: ENCOUNTER_INITIAL_VERSION,
        createdBy: userId,
        instant,
      });
    } catch (error) {
      if (error instanceof ResponsiblePhysicianNotAssignableError) {
        throw responsiblePhysicianNotAssignable();
      }

      throw error;
    }

    for (const diagnosis of command.diagnoses) {
      await this.encounters.insertDiagnosis(tenant, {
        id: randomUUID(),
        practiceId,
        encounterId,
        codingSystem: diagnosis.codingSystem,
        code: diagnosis.code,
        isPrimary: diagnosis.isPrimary,
        instant,
      });
    }

    return encounterId;
  }

  private async readRepresentation(
    tenant: AdmittedTenantSession,
    encounterId: string,
  ): Promise<EncounterCreatedResponseDto | undefined> {
    const row = await this.encounters.findProjection(tenant, encounterId);

    return row === undefined ? undefined : projectEncounterCreated(row);
  }
}
