/**
 * `GET /api/v1/practices/{practiceId}` — the authorised read of the current tenant practice.
 *
 * Normative sources: `03` §3.2, §3.4 and §3.7.1; the accepted `GET /practices/{practiceId}`
 * contract in `03`; `03` §28.5 (permission derivation); `04` §5.2 and §5.3; `15` §5;
 * D-038 clauses 12–14; D-047 clauses 8, 10, 11 and 18; D-049.
 *
 * THE ORDER IS THE CONTRACT — AGAIN, AND MORE SO
 *
 * `03` §3.7.1 states that the order is mandatory and that no step may be skipped, and D-047
 * clause 10 repeats it for the requested practice specifically. The whole chain runs inside the
 * ONE interactive transaction of D-047 clause 8, on one pinned connection, and every rejection
 * throws, which rolls that transaction back and discards `app.auth_subject` and `app.user_id`
 * with it:
 *
 *     BEGIN                                        (D-047 clause 8)
 *       set_auth_subject_context(subject)          \
 *       bootstrap users read, exactly one row       |  IdentityBootstrapService
 *       users.status = ACTIVE                       |  (03 §3.7.1 steps 1-2,
 *       set_user_context(users.id)                 /   D-047 clauses 2-4 and 9)
 *       read + validate X-Practice-ID                  (03 §3.7.1 step 3)
 *       path practiceId == practice context            (03, negative cases)
 *       membership-scoped read of the practice          (03 §3.7.1 step 4, D-047 clause 10)
 *       0 rows                 -> 403 ACCESS_DENIED, ROLLBACK
 *       practice.status <> ACTIVE -> 403 ACCESS_DENIED, ROLLBACK
 *       membership of THIS user in THIS practice        (D-047 clause 18)
 *       no membership          -> 403 ACCESS_DENIED, ROLLBACK
 *       membership not active  -> 403 ACCESS_DENIED, ROLLBACK
 *       roles of that membership, settings of that practice
 *       practice.read in the derived effective set      (03 §28.5, 15 §5)
 *       not granted            -> 403 ACCESS_DENIED, ROLLBACK
 *       projection of exactly six fields
 *     COMMIT
 *
 * WHERE PHASE 4 WOULD BE
 *
 * D-047 clause 10 places `set_request_context` at step 7, AFTER the practice-status check, so
 * that no non-`ACTIVE` practice ever obtains a tenant context and the privileged window has
 * length zero. In phase 3 that step DOES NOT EXIST: there is no `set_request_context`, no
 * `app.practice_id`, no `PracticeContextGuard` and no `TenantDatabaseService` (D-047 clause 16).
 * The practical meaning of the requirement here is the one this service implements — every
 * rejection happens strictly before the point where phase 4 will establish tenant context, so
 * adding that call later changes nothing about which requests are refused.
 *
 * D-047 clause 18 is explicit that phase 3 performs the tenant narrowing for this route at the
 * APPLICATION layer, additionally to what RLS already does. This service therefore proves three
 * identities align — the verified current user, the requested path `practiceId`, and
 * `X-Practice-ID` — and that the user owns an eligible active membership in that practice.
 *
 * NO GRANT IS RESTATED HERE
 *
 * The service names the permission the endpoint REQUIRES, which `04` §5.2 assigns to `03`, and
 * derives whether the caller holds it through {@link resolveEffectivePermissions} and
 * {@link hasEffectivePermission} — the single application representation of the `15` matrix
 * (`04` §6.4.1). There is no `role === 'PRACTICE_ADMIN'` anywhere in this file, and there must
 * never be one: the matrix is the oracle, and a hard-coded role check would silently survive a
 * change to it.
 */

import { Injectable } from '@nestjs/common';

import { type Permission, type PracticeResponseDto } from '@axenita/contracts';

import {
  hasEffectivePermission,
  resolveEffectivePermissions,
  type ConditionalPermissionSettings,
} from '../domain/effective-permissions.js';
import { accessDenied } from '../identity.errors.js';
import {
  type IdentityBootstrapSession,
  type RequestedPracticeRow,
} from '../infrastructure/identity-database.port.js';
import {
  DISABLED_CONDITIONAL_SETTINGS,
  IdentityBootstrapService,
  tenantRolesOf,
} from './identity-bootstrap.service.js';
import { assertPathMatchesPracticeContext, readPracticeContext } from './practice-context.js';

/**
 * The permission this endpoint requires (`03`, `15` §5, D-047 clause 11).
 *
 * Typed as {@link Permission}, so a typo is a compile error rather than a permission that is
 * silently never granted. This names WHICH permission the route asks for; it says nothing about
 * which role holds it, which is the matrix's business alone (`04` §5.2).
 */
const REQUIRED_PERMISSION: Permission = 'practice.read';

/** The one `entity_status` value that admits a practice (`02` §4.2, D-047 clause 10). */
const ACTIVE_PRACTICE_STATUS = 'ACTIVE';

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
  public constructor(private readonly identityBootstrap: IdentityBootstrapService) {}

  /**
   * Resolves the caller, authorises the read and projects the practice.
   *
   * Returns only for a caller who is an `ACTIVE` user, holds an ACTIVE membership in the
   * requested `ACTIVE` practice, and whose roles in THAT membership derive `practice.read`.
   * Every other outcome throws.
   */
  public async loadPractice(request: PracticeReadRequest): Promise<PracticeResponseDto> {
    return this.identityBootstrap.runAuthenticatedSession(
      request.verifiedAuthSubject,
      async (session, user) => {
        // Step 3 of 03 §3.7.1 — deliberately AFTER admission. A caller whose identity has not
        // been admitted must not learn anything about their headers, and 03 §3.7.1 forbids
        // reordering the chain.
        const practiceContextId = readPracticeContext(request.practiceContextHeader);

        // 03: "practiceId iz putanje mora odgovarati uspostavljenom practice contextu". The
        // mismatch answer is the shared 403, indistinguishable from every other refusal.
        assertPathMatchesPracticeContext(
          request.requestedPracticeId,
          practiceContextId,
          accessDenied,
        );

        const practice = await this.admitPractice(session, practiceContextId);
        const permissions = await this.derivePermissions(session, user.id, practiceContextId);

        // 03 §28.5 and 15 §5, evaluated through the single matrix representation. PRACTICE_ADMIN
        // is the only tenant role the accepted matrix grants this permission to; SYSTEM_ADMIN is
        // a platform role, is not an input to this derivation at all, and therefore cannot
        // contribute (D-038 clauses 12-14, D-047 clause 11).
        if (!hasEffectivePermission(permissions, REQUIRED_PERMISSION)) {
          throw accessDenied();
        }

        return project(practice);
      },
    );
  }

  /**
   * Step 4 of `03` §3.7.1 and steps 4 to 6 of D-047 clause 10 — the membership-scoped read of
   * the requested practice and its status check.
   *
   * Both refusals are the same `403 ACCESS_DENIED` with the same body. A practice that does not
   * exist, a practice the caller is not a member of, and a practice that is not `ACTIVE` are
   * indistinguishable from outside, which is what prevents enumeration (`03`, negative cases).
   */
  private async admitPractice(
    session: IdentityBootstrapSession,
    practiceId: string,
  ): Promise<RequestedPracticeRow> {
    const practice = await session.findRequestedPractice(practiceId);

    // Zero rows. The 02 §17.6 membership policy exposes only practices the caller holds a
    // membership in, so this covers "no such practice" and "not my practice" at once.
    if (practice === undefined) {
      throw accessDenied();
    }

    // D-047 clause 10 — a practice whose status is not ACTIVE is refused with a rollback, and
    // in phase 4 this refusal will still stand strictly before `set_request_context`.
    if (practice.status !== ACTIVE_PRACTICE_STATUS) {
      throw accessDenied();
    }

    return practice;
  }

  /**
   * The membership half of the narrowing, plus the permission derivation for it.
   *
   * The membership read binds the resolved current user and the requested practice in one
   * statement (D-047 clause 18). Its absence and its inactivity are separate checks with the
   * same answer: D-047 clause 10 notes that practice visibility proves a membership EXISTS —
   * the §17.6 policy does not filter `pm.active` — while activity is a second, independent
   * fact. In phase 4 `set_request_context` re-establishes that second fact in the database;
   * in phase 3 this check is the only thing that does, so it may not be skipped on the grounds
   * that the practice was visible.
   */
  private async derivePermissions(
    session: IdentityBootstrapSession,
    userId: string,
    practiceId: string,
  ): Promise<readonly Permission[]> {
    const membership = await session.findMembershipInPractice(userId, practiceId);

    if (membership === undefined || membership.active !== true) {
      throw accessDenied();
    }

    const roleRows = await session.findMembershipRoles([membership.id]);
    const roles = tenantRolesOf(membership.id, roleRows);

    // `practice.read` is not a CONDITIONAL cell, but the resolver derives the WHOLE effective
    // set of the membership and its API therefore requires the practice's flags. They are read
    // for the requested practice only — never for any other — and they are an input, never an
    // output: nothing from `practice_settings` reaches the response (D-049, 03 §28.5).
    const settings = await this.readConditionalSettings(session, practiceId);

    return resolveEffectivePermissions({
      // Already proven true above. Passed through rather than hard-coded, so the resolver's own
      // "an inactive membership grants nothing" rule (`15` §3.2) stays a second, independent
      // barrier instead of being bypassed by a literal.
      active: membership.active,
      roles,
      settings,
    });
  }

  /** The conditional flags of exactly one practice, fail-closed when there is no row (D-041). */
  private async readConditionalSettings(
    session: IdentityBootstrapSession,
    practiceId: string,
  ): Promise<ConditionalPermissionSettings> {
    const rows = await session.findConditionalSettings([practiceId]);
    const settings = rows.find((row) => row.practiceId === practiceId);

    if (settings === undefined) {
      return DISABLED_CONDITIONAL_SETTINGS;
    }

    // Strict equality, exactly as the resolver applies it: anything other than a literal `true`
    // fails closed.
    return Object.freeze({
      allowMpaApproval: settings.allowMpaApproval === true,
      allowBillingSpecialistApproval: settings.allowBillingSpecialistApproval === true,
    });
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
