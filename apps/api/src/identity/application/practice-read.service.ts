/**
 * `GET /api/v1/practices/{practiceId}` — the authorised read of the current tenant practice.
 *
 * Normative sources: `03` §3.2, §3.4 and §3.7.1; the accepted `GET /practices/{practiceId}`
 * contract in `03`; `03` §28.5 (permission derivation); `04` §5.2 and §5.3; `15` §5;
 * D-038 clauses 12–14; D-047 clauses 8, 10, 11 and 18; D-049.
 *
 * THE ORDER IS THE CONTRACT — AND IT IS NOW COMPLETE
 *
 * `03` §3.7.1 states that the order is mandatory and that no step may be skipped, and D-047
 * clause 10 repeats it for the requested practice specifically. The whole chain runs inside the
 * ONE interactive transaction of D-047 clause 8, on one pinned connection, and every rejection
 * throws, which rolls that transaction back and discards `app.auth_subject`, `app.user_id` and
 * `app.practice_id` with it:
 *
 *     BEGIN                                        (D-047 clause 8)
 *       set_auth_subject_context(subject)          \
 *       bootstrap users read, exactly one row       |  IdentityBootstrapService
 *       users.status = ACTIVE                       |  (03 §3.7.1 steps 1-2,
 *       set_user_context(users.id)                 /   D-047 clauses 2-4 and 9)
 *       read + validate X-Practice-ID              \
 *       path practiceId == practice context         |
 *       membership-scoped read of the practice      |
 *       0 rows / status <> ACTIVE -> 403, ROLLBACK  |  TenantRequestPipeline
 *       ACTIVE membership of THIS user             /   (03 §3.7.1 steps 3-6,
 *       absent or inactive        -> 403, ROLLBACK  |   D-047 clauses 10, 11 and 18)
 *       set_request_context(requested practice)     |
 *         ACTIVE membership re-validated in the DB  |
 *         app.practice_id now exists                |
 *       roles of that membership, settings of that  |
 *       practice, effective permission set          |
 *       practice.read not granted -> 403, ROLLBACK /
 *       the practice, read under tenant RLS            <-- step 11, below
 *       projection of exactly six fields
 *     COMMIT
 *
 * WHAT THIS SERVICE STILL OWNS
 *
 * Two things, and deliberately only two: WHICH permission the route requires, and WHAT the
 * route does once the request has been admitted. Everything between admission and those two —
 * the header, the path/header match, the practice, the membership, the tenant context, the
 * roles, the settings and the permission decision — belongs to {@link TenantRequestPipeline},
 * so that the frozen order lives in one place and cannot drift per route.
 *
 * STEP 11 IS A SECOND READ, ON PURPOSE
 *
 * The practice was already read once, at step 4, to decide admission — necessarily BEFORE
 * `app.practice_id` existed, because D-047 clause 10 puts the status check strictly before
 * `set_request_context`. Projecting that first row would mean the response of a tenant route
 * was assembled from a read taken outside the tenant context, which is exactly the property
 * this phase exists to establish. The row is therefore re-read through the SAME narrow
 * six-column surface, now under the established context, where `practices_context_narrow`
 * (`02` §17.6) is RESTRICTIVE and can return no practice other than `app.practice_id`. No new
 * query, no new column, no new representation and no change to the frozen response contract.
 *
 * NO GRANT IS RESTATED HERE
 *
 * The service names the permission the endpoint REQUIRES, which `04` §5.2 assigns to `03`; the
 * pipeline derives whether the caller holds it through the single application representation of
 * the `15` matrix (`04` §6.4.1). There is no `role === 'PRACTICE_ADMIN'` anywhere in this file,
 * and there must never be one: the matrix is the oracle, and a hard-coded role check would
 * silently survive a change to it.
 */

import { Injectable } from '@nestjs/common';

import { type Permission, type PracticeResponseDto } from '@axenita/contracts';

import { accessDenied } from '../identity.errors.js';
import {
  type IdentityBootstrapSession,
  type RequestedPracticeRow,
} from '../infrastructure/identity-database.port.js';
import { IdentityBootstrapService } from './identity-bootstrap.service.js';
import { TenantRequestPipeline } from './tenant-request.pipeline.js';

/**
 * The permission this endpoint requires (`03`, `15` §5, D-047 clause 11).
 *
 * Typed as {@link Permission}, so a typo is a compile error rather than a permission that is
 * silently never granted. This names WHICH permission the route asks for; it says nothing about
 * which role holds it, which is the matrix's business alone (`04` §5.2).
 */
const REQUIRED_PERMISSION: Permission = 'practice.read';

/** Everything one request supplies. All three inputs are narrowed against each other. */
export interface PracticeReadRequest {
  /** The subject of an already verified bearer credential (never a body, query or header). */
  readonly verifiedAuthSubject: string;
  /** The raw `{practiceId}` path segment, exactly as received. */
  readonly requestedPracticeId: string;
  /** The raw `X-Practice-ID` value, or `undefined` when the client sent none. */
  readonly practiceContextHeader: string | undefined;
}

@Injectable()
export class PracticeReadService {
  public constructor(
    private readonly identityBootstrap: IdentityBootstrapService,
    private readonly tenantRequests: TenantRequestPipeline,
  ) {}

  /**
   * Resolves the caller, admits the tenant request and projects the practice.
   *
   * Returns only for a caller who is an `ACTIVE` user, holds an ACTIVE membership in the
   * requested `ACTIVE` practice, and whose roles in THAT membership derive `practice.read`.
   * Every other outcome throws.
   */
  public async loadPractice(request: PracticeReadRequest): Promise<PracticeResponseDto> {
    return this.identityBootstrap.runAuthenticatedSession(
      request.verifiedAuthSubject,
      async (session) => {
        // Steps 3 to 10. Returns only for an admitted request, and only with
        // `app.practice_id` established for the remainder of this transaction.
        //
        // The admitted user is NOT passed. The pipeline derives the membership from the
        // `app.user_id` this session already established, so this route cannot name an identity
        // even by mistake (D-054 clause 12).
        const admitted = await this.tenantRequests.admit(session, {
          requestedPracticeId: request.requestedPracticeId,
          practiceContextHeader: request.practiceContextHeader,
          requiredPermission: REQUIRED_PERMISSION,
        });

        return project(await this.readAdmittedPractice(session, admitted.practiceId));
      },
    );
  }

  /**
   * Step 11 — the business read, under the established tenant context.
   *
   * `practiceId` is the admitted practice and therefore the value now in `app.practice_id`, so
   * the RESTRICTIVE §17.6 narrowing and the explicit predicate agree by construction; the
   * statement could not return another tenant's practice even if they did not.
   *
   * `undefined` is unreachable: the same statement returned a row a few steps earlier under a
   * strictly WIDER policy state, and the context that narrowed it since names this very
   * practice. It is still handled, and handled as the shared refusal rather than as an
   * internal error, because a tenant route that cannot see its own tenant must fail closed.
   */
  private async readAdmittedPractice(
    session: IdentityBootstrapSession,
    practiceId: string,
  ): Promise<RequestedPracticeRow> {
    const practice = await session.findRequestedPractice(practiceId);

    if (practice === undefined) {
      throw accessDenied();
    }

    return practice;
  }
}

/**
 * The accepted response projection — exactly six fields, written out one by one.
 *
 * The row is never spread and never returned as-is. Building the document member by member is
 * what guarantees that a future widening of the database projection, of a column grant or of the
 * Prisma model cannot add a field to the HTTP response by accident. `zsrNumber`, `glnNumber` and
 * `legalName` are absent here, absent from the query, and absent from the column grant.
 */
function project(practice: RequestedPracticeRow): PracticeResponseDto {
  return {
    id: practice.id,
    code: practice.code,
    name: practice.name,
    defaultLanguage: practice.defaultLanguage,
    timezone: practice.timezone,
    status: practice.status,
  };
}
