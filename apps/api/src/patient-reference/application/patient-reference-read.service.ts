/**
 * `GET /api/v1/patient-references/{id}` — the tenant-scoped read of one patient reference.
 *
 * Normative sources: `03` §3.2, §3.4, §3.7.1, §8, §9 and §11; `09` §4, §4.2 and §18.1 threat
 * `T1`; `15` §5; D-054 clauses 6–10 and 12; D-056 clause 5; D-060 clause 38; D-062 part H.1;
 * D-072 `OD-P5-I4-12` and `OD-P5-I4-13`; D-073 `OD-P5-I4A-1` … `OD-P5-I4A-3`.
 *
 * THE ORDER IS THE CONTRACT, AND IT IS THE SAME ORDER AS EVERY OTHER TENANT ROUTE
 *
 *     BEGIN                                        (D-047 clause 8)
 *       set_auth_subject_context(subject)          \
 *       bootstrap users read, exactly one row       |  IdentityBootstrapService
 *       users.status = ACTIVE                       |  (03 §3.7.1 steps 1-2)
 *       set_user_context(users.id)                 /
 *       read + validate X-Practice-ID              \
 *       NO path/header comparison — HEADER_ONLY     |
 *       membership-scoped read of the practice      |  TenantRequestPipeline
 *       0 rows / status <> ACTIVE -> 403, ROLLBACK  |  (03 §3.7.1 steps 3-10)
 *       ACTIVE membership of THIS user             /   THE SAME ONE PIPELINE
 *       absent or inactive        -> 403, ROLLBACK  |
 *       set_request_context(admitted practice)      |
 *       roles, settings, effective permissions      |
 *       patient_reference.read not held -> 403     /
 *       {id} is a well-formed identifier?              <-- step 11a, below
 *       no  -> 400 VALIDATION_ERROR, ZERO resource reads
 *       ONE tenant-scoped patient_references SELECT    <-- step 11b, below
 *       0 rows -> 404 RESOURCE_NOT_FOUND (one path)
 *       projection of exactly six fields
 *     COMMIT
 *
 * `HEADER_ONLY`, AND WHAT THAT DOES NOT MEAN (D-073 `OD-P5-I4A-1`)
 *
 * `PATIENT_REFERENCE_GET_TENANT_SCOPE = HEADER_ONLY`. The path of this route carries no practice
 * identity, so no path/header comparison is performed and none is faked: the header value is not
 * passed back in as a pretend path segment, and the header-derived practice is never compared
 * with itself. It is NOT a weaker or separate admission path. `X-Practice-ID` is still mandatory
 * and still validated by the same code, and every downstream step — practice existence,
 * `practices.status`, the ACTIVE membership, `set_request_context` and the permission decision —
 * is literally the same code as for `PRACTICE_PATH` routes, because there is exactly one
 * `TenantRequestPipeline` (`TENANT_ADMISSION_PIPELINE_COUNT = 1`).
 *
 * WHY THE IDENTIFIER IS VALIDATED HERE AND NOT IN THE CONTROLLER
 *
 * `03` §3.7.1 fixes the order and forbids reordering it: a caller whose identity has not been
 * admitted must not learn anything about the shape of their request. A controller-level check
 * would run before admission and would answer `400` to a caller who is owed `403` — the exact
 * inversion an existing permanent regression pins down for `X-Practice-ID`. Validating after the
 * permission decision also keeps the answer uniform for a caller who lacks
 * `patient_reference.read`: they receive `403` whatever the shape of the identifier.
 *
 * What matters for `MALFORMED_RESOURCE_UUID_DB_READS = 0` is that the check is strictly before
 * the FEATURE READ, and it is: the adapter is not reached at all on that branch, so no
 * `patient_references` statement — tenant-scoped or otherwise — is ever executed for a malformed
 * identifier, and no cross-tenant lookup exists anywhere on this path.
 *
 * THE PROTECTED `404` PAIR IS ONE CODE PATH, NOT TWO THAT AGREE
 *
 * A valid identifier naming no row and a valid identifier naming another practice's row both
 * arrive here as `undefined` from ONE statement, and both leave through ONE factory at ONE call
 * site. They are not merely answered identically; they are not distinguishable in this file.
 * There is no second query, no existence pre-read and no cross-tenant discriminator to make them
 * so (`09` §18.1 `T1`).
 */

import { Injectable } from '@nestjs/common';

import { type PatientReferenceResponseDto, type Permission } from '@axenita/contracts';

import { TenantDatabaseService } from '../../database/tenant-database.service.js';
import { IdentityBootstrapService } from '../../identity/application/identity-bootstrap.service.js';
// The ACCEPTED repository UUID-shape semantics, reused verbatim and UNCHANGED (D-073
// `OD-P5-I4A-2`). No UUID version or variant constraint is added, `ParseUUIDPipe` does not become
// a canonical requirement, and no UUID dependency is introduced: the set of accepted inputs is
// exactly the set the practice-context helper already accepts, because changing it would be a
// contract change requiring its own decision.
import { isUuid } from '../../identity/application/practice-context.js';
import { TenantRequestPipeline } from '../../identity/application/tenant-request.pipeline.js';
import { PatientReferenceDatabase } from '../infrastructure/patient-reference.database.js';
import {
  patientReferenceNotFound,
  resourceIdentifierInvalid,
} from '../patient-reference.errors.js';
import { projectPatientReference } from './patient-reference-projection.js';

/**
 * The permission this endpoint requires (`03` §11, `15` §5).
 *
 * Typed as {@link Permission}, so a typo is a compile error rather than a permission that is
 * silently never granted. It names WHICH permission the route asks for and says nothing about
 * which role holds it — that is the `15` matrix's business alone.
 */
const REQUIRED_PERMISSION: Permission = 'patient_reference.read';

/** Everything one request supplies. */
export interface PatientReferenceReadRequest {
  /** The subject of an already verified bearer credential (never a body, query or header). */
  readonly verifiedAuthSubject: string;
  /** The raw `{id}` path segment, exactly as received and not yet trusted. */
  readonly resourceId: string;
  /** The raw `X-Practice-ID` value, or `undefined` when the client sent none. */
  readonly practiceContextHeader: string | undefined;
}

@Injectable()
export class PatientReferenceReadService {
  public constructor(
    private readonly identityBootstrap: IdentityBootstrapService,
    private readonly tenantRequests: TenantRequestPipeline,
    private readonly tenantDatabase: TenantDatabaseService,
    private readonly patientReferences: PatientReferenceDatabase,
  ) {}

  /**
   * Resolves the caller, admits the tenant request and projects the patient reference.
   *
   * Returns only for a caller who is an `ACTIVE` user, holds an ACTIVE membership in the
   * `ACTIVE` practice named by `X-Practice-ID`, derives `patient_reference.read` from the roles
   * of THAT membership, and named a well-formed identifier that resolves to a row of THAT
   * practice. Every other outcome throws.
   */
  public async loadPatientReference(
    request: PatientReferenceReadRequest,
  ): Promise<PatientReferenceResponseDto> {
    return this.identityBootstrap.runAuthenticatedSession(
      request.verifiedAuthSubject,
      async (session) => {
        // Steps 3 to 10, through the SAME single pipeline every tenant route uses. The admitted
        // user is NOT passed, because there is no parameter for one: the pipeline derives the
        // membership from the `app.user_id` this session established (D-054 clause 12).
        const admitted = await this.tenantRequests.admit(session, {
          // `HEADER_ONLY` (D-073): no path practice id, mandatory or otherwise, and therefore
          // nothing to compare and nothing to fake.
          scope: { mode: 'HEADER_ONLY' },
          practiceContextHeader: request.practiceContextHeader,
          requiredPermission: REQUIRED_PERMISSION,
        });

        // Step 11a — the identifier, and STRICTLY BEFORE the feature adapter is touched. The
        // rejection is static and reflects nothing of the input.
        if (!isUuid(request.resourceId)) {
          throw resourceIdentifierInvalid();
        }

        // The facade narrows the admitted request to the statement surface of this tenant. It
        // opens no transaction, owns no client and establishes nothing: the connection, the
        // transaction and `app.practice_id` are all the ones admission already produced.
        const tenant = this.tenantDatabase.forAdmittedRequest(session, admitted);

        // Step 11b — THE ONE tenant-scoped statement. There is no read before it and none after
        // it.
        const patientReference = await this.patientReferences.findInAdmittedPractice(
          tenant,
          request.resourceId,
        );

        if (patientReference === undefined) {
          // BOTH CAUSES, ONE ANSWER, ONE LINE. "No such row" and "a row of another practice"
          // are indistinguishable here by construction, and nothing downstream can separate
          // them either (`09` §18.1 `T1`).
          throw patientReferenceNotFound();
        }

        return projectPatientReference(patientReference);
      },
    );
  }
}
