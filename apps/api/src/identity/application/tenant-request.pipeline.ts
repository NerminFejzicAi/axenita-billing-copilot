/**
 * The tenant request/context pipeline — steps 3 to 10 of the frozen `03` §3.7.1 chain.
 *
 * Normative sources: `03` §3.2 (the `X-Practice-ID` contract), §3.4 (route classification),
 * §3.7.1 (the mandatory order), §28.5 (permission derivation); `02` §16.2.3
 * (`set_request_context`), §17.1, §17.3, §17.4, §17.6; `15` §5; D-006; D-033 clauses 7–12;
 * D-041; D-047 clauses 8, 10, 11 and 18; D-049; D-053.
 *
 * WHAT THIS OWNS
 *
 * Exactly the tenant half of an authenticated request, and nothing else. The authenticated
 * half — `set_auth_subject_context`, the bootstrap `users` read, the `ACTIVE` user decision and
 * `set_user_context` — belongs to {@link IdentityBootstrapService.runAuthenticatedSession} and
 * is NOT duplicated, re-implemented or re-entered here. This pipeline is reached only from
 * inside that one interactive transaction, with `app.user_id` already established, because the
 * session and the admitted user are parameters it cannot manufacture for itself.
 *
 * THE ORDER IS THE CONTRACT
 *
 * `03` §3.7.1 states that the order is mandatory and that no step may be skipped; D-047
 * clause 10 restates it for the requested practice and fixes where `set_request_context` sits.
 * The complete chain of one admitted tenant request, with the steps this file owns marked:
 *
 *     BEGIN                                              (D-047 clause 8)
 *   1   bearer verified                                  DevelopmentAuthGuard
 *   2a  set_auth_subject_context(subject)                \
 *   2b  bootstrap users read, exactly one row             |  IdentityBootstrapService
 *   2c  users.status = ACTIVE                             |  (03 §3.7.1 steps 1-2)
 *   2d  set_user_context(users.id)                       /
 *   3   read + validate X-Practice-ID                    \
 *       path practiceId == practice context               |
 *   4   membership-scoped read of the requested practice  |
 *       0 rows                    -> 403, ROLLBACK        |
 *       practice.status <> ACTIVE -> 403, ROLLBACK        |
 *       ACTIVE membership of THIS user in THIS practice   |  THIS FILE
 *       absent or inactive        -> 403, ROLLBACK        |
 *   5   set_request_context(requested practice id)        |
 *   6     ACTIVE membership re-validated IN the function  |
 *   7     app.practice_id now exists                      |
 *   8   roles of THAT membership                          |
 *   9   settings of THAT practice, effective permissions  |
 *  10   required permission held                         /
 *       not held                  -> 403, ROLLBACK
 *  11   the business operation, under tenant RLS         the calling route service
 *     COMMIT
 *
 * WHY THIS IS NOT A NEST GUARD
 *
 * Derived planning material names a `PracticeContextGuard` (`01` §17.1, `09` §5, D-006). It is
 * NOT implemented as a `CanActivate`, and this class is the accepted realisation of that
 * concept instead. A Nest guard runs BEFORE the controller and therefore before the interactive
 * transaction of D-047 clause 8 even opens, so it would necessarily answer a caller whose
 * identity has not been admitted yet — the exact inversion `03` §3.7.1 forbids, and the one a
 * merged permanent regression test already pins down: an unknown or inactive user must receive
 * `403` before a missing `X-Practice-ID` could produce `400`. A guard also cannot establish
 * `app.practice_id`, because the transaction-local GUC only exists inside the transaction the
 * controller's service opens. The stage therefore lives INSIDE the authenticated transaction.
 *
 * WHY THERE IS NO SECOND DATABASE STACK
 *
 * The same planning material names a `TenantDatabaseService` (`01` §6.2, `09` §5, D-006). No
 * such class is created here, because no canonical source mechanically requires a concrete one
 * in this slice — `01` §6.2 lists it as a `database` module component of the phase 4 business
 * modules, and D-047 clause 16 assigns this slice no artefact of that name. Its accepted
 * PROPERTY, "every tenant query runs inside one interactive transaction with an established
 * request context", is already structural here: there is one `PrismaService`, one `copilot_app`
 * client, one interactive transaction, one pinned {@link IdentityBootstrapSession} and one
 * accepted `setRequestContext`. A facade over that session would own no client, open no
 * transaction and hold no connection, so it would add a name and no property.
 *
 * IT IS NOT A FRAMEWORK
 *
 * {@link TenantRequestPipeline.admit} takes no callback and exposes no per-step hook, so no
 * caller can run the steps in a different order, skip one, or interleave work between them. It
 * returns a narrow value object describing ONE admitted tenant request, and the only way to
 * obtain that object is to have passed every step.
 */

import { Injectable } from '@nestjs/common';

import { type Permission } from '@axenita/contracts';

import {
  hasEffectivePermission,
  resolveEffectivePermissions,
  type ConditionalPermissionSettings,
} from '../domain/effective-permissions.js';
import { accessDenied } from '../identity.errors.js';
import {
  TenantContextRejectedError,
  type IdentityBootstrapSession,
} from '../infrastructure/identity-database.port.js';
import { DISABLED_CONDITIONAL_SETTINGS, tenantRolesOf } from './identity-bootstrap.service.js';
import { assertPathMatchesPracticeContext, readPracticeContext } from './practice-context.js';

/** The one `entity_status` value that admits a practice (`02` §4.2, D-047 clause 10). */
const ACTIVE_PRACTICE_STATUS = 'ACTIVE';

/** Everything ONE tenant request supplies, before any of it has been trusted. */
export interface TenantRequest {
  /** The raw `{practiceId}` path segment, exactly as received. */
  readonly requestedPracticeId: string;
  /** The raw `X-Practice-ID` value, or `undefined` when the client sent none. */
  readonly practiceContextHeader: string | undefined;
  /**
   * The permission the route requires (`04` §5.2 assigns it to `03`).
   *
   * Typed as {@link Permission}, so a typo is a compile error rather than a permission that is
   * silently never granted. It names WHICH permission is required and says nothing about which
   * role holds it — that is the `15` matrix's business alone.
   */
  readonly requiredPermission: Permission;
}

/**
 * One admitted tenant request: every step of `03` §3.7.1 up to and including the required
 * permission has passed, and `app.practice_id` is established for the CURRENT transaction.
 *
 * Deliberately narrow. It carries no practice row, so the business operation of step 11 cannot
 * accidentally project a row that was read BEFORE the tenant context existed; the route must
 * perform its own read under the established context.
 */
export interface AdmittedTenantRequest {
  /**
   * The validated, normalised practice of this request — the value now in `app.practice_id`,
   * and the only practice any statement of step 11 may name.
   */
  readonly practiceId: string;
  /** The ACTIVE membership of the current user in that practice. */
  readonly membershipId: string;
  /**
   * The effective tenant permissions of THAT membership in THAT practice, derived through the
   * single matrix representation. Contains {@link TenantRequest.requiredPermission}.
   */
  readonly permissions: readonly Permission[];
}

@Injectable()
export class TenantRequestPipeline {
  /**
   * Admits one tenant request, or throws.
   *
   * THERE IS NO IDENTITY PARAMETER (D-054 clause 12). This method used to take a `userId`
   * alongside the session. At its one call site that value came from the admitted user and was
   * correct, but the SIGNATURE permitted the sentence "authorise practice P using user U2" while
   * the authenticated `app.user_id` was U1 — and D-054 clause 12 requires the wrong user to be
   * mechanically inexpressible before any further tenant route exists. It is not enough to pass
   * the right value, nor to accept one and assert equality afterwards: the parameter itself is
   * the seam, so the parameter is gone. The only identity reachable from here is the one
   * `session` already carries.
   *
   * @param session the pinned session of the ALREADY-OPEN authenticated transaction. It cannot
   *   be constructed by a caller and it exists only inside
   *   {@link IdentityBootstrapService.runAuthenticatedSession}, which is what makes steps 2a–2d
   *   impossible to bypass — and which is why it, and not an argument, is the identity.
   * @param request the untrusted inputs of the tenant request. It carries no user identity, and
   *   none may be added to it: moving the seam into this object would restore it verbatim.
   */
  public async admit(
    session: IdentityBootstrapSession,
    request: TenantRequest,
  ): Promise<AdmittedTenantRequest> {
    // Step 3, deliberately AFTER admission. A caller whose identity has not been admitted must
    // not learn anything about their headers, and `03` §3.7.1 forbids reordering the chain.
    const practiceId = readPracticeContext(request.practiceContextHeader);

    // `03`: "practiceId iz putanje mora odgovarati uspostavljenom practice contextu". The
    // mismatch answer is the shared 403, indistinguishable from every other refusal.
    assertPathMatchesPracticeContext(request.requestedPracticeId, practiceId, accessDenied);

    // Step 4 — BOTH halves, and both strictly before any tenant context exists.
    await this.admitRequestedPractice(session, practiceId);
    const membershipId = await this.admitActiveMembership(session, practiceId);

    // Steps 5 to 7.
    await this.establishTenantContext(session, practiceId);

    // Steps 8 and 9.
    const permissions = await this.derivePermissions(session, membershipId, practiceId);

    // Step 10 — evaluated through the single matrix representation (`03` §28.5, `15` §5).
    // There is no `role === 'PRACTICE_ADMIN'` anywhere in this file and there must never be
    // one: the matrix is the oracle, and a hard-coded role check would silently survive a
    // change to it. Platform roles are not read here at all, so `SYSTEM_ADMIN` cannot
    // contribute (D-023 clause 10, D-038 clauses 12-14, D-047 clause 11).
    if (!hasEffectivePermission(permissions, request.requiredPermission)) {
      throw accessDenied();
    }

    return Object.freeze({ practiceId, membershipId, permissions });
  }

  /**
   * Step 4 of `03` §3.7.1 and steps 4 to 6 of D-047 clause 10 — the membership-scoped read of
   * the requested practice and its status check, BEFORE `set_request_context`.
   *
   * The status check may not move into the database function and the function's body may not
   * be changed to perform it (D-047 clause 10, "Tijelo `set_request_context` se ne mijenja").
   * Keeping it here is what gives the privileged window length zero: no non-`ACTIVE` practice
   * ever obtains a tenant context, not even for the duration of one statement.
   *
   * Both refusals are the same `403 ACCESS_DENIED` with the same body. A practice that does not
   * exist, a practice the caller is not a member of, and a practice that is not `ACTIVE` are
   * indistinguishable from outside, which is what prevents enumeration (`03`, negative cases).
   */
  private async admitRequestedPractice(
    session: IdentityBootstrapSession,
    practiceId: string,
  ): Promise<void> {
    // Read BEFORE the context exists on purpose: the `02` §17.6 RESTRICTIVE narrowing is
    // inactive while `app.practice_id` is NULL, so the PERMISSIVE membership branch alone
    // decides visibility and a practice the caller holds no membership in is zero rows.
    const practice = await session.findRequestedPractice(practiceId);

    if (practice === undefined) {
      throw accessDenied();
    }

    if (practice.status !== ACTIVE_PRACTICE_STATUS) {
      throw accessDenied();
    }
  }

  /**
   * The application-level active-membership barrier — D-047 clauses 10 and 18.
   *
   * This is barrier A of two, and it is NOT made redundant by the one inside
   * `set_request_context`. D-047 clause 10 is explicit: step 4 proves that a membership EXISTS
   * (the §17.6 policy does not filter `pm.active`), step 8 proves that it is ACTIVE, "oba su
   * potrebna; nijedan ne zamjenjuje drugi". Dropping this one would also mean the ONLY signal
   * for an inactive membership was a database exception, which is a far worse control than a
   * decision taken in the open.
   *
   * The read binds the CURRENT AUTHENTICATED user and the requested practice in one statement.
   * Reading a user's memberships and picking the matching one in memory would be a weaker, and
   * therefore wrong, implementation of the same requirement.
   *
   * WHICH user is not decided here and cannot be. The session method takes no user argument: it
   * derives the identity from the transaction-local `app.user_id` that step 2d established on
   * this same pinned connection (D-054 clause 12). This method therefore cannot admit a
   * membership of anyone other than the caller, whatever it is passed — the only thing it can
   * name is the practice.
   */
  private async admitActiveMembership(
    session: IdentityBootstrapSession,
    practiceId: string,
  ): Promise<string> {
    const membership = await session.findCurrentUserMembershipInPractice(practiceId);

    if (membership === undefined || membership.active !== true) {
      throw accessDenied();
    }

    return membership.id;
  }

  /**
   * Steps 5 to 7 — the tenant execution boundary.
   *
   * The ONLY accepted way to establish `app.practice_id` (`02` §16.2.3, D-033 clauses 7–12).
   * No `set_config('app.practice_id', ...)`, no second session method, no additional database
   * function, no `SECURITY DEFINER` and no RLS bypass exists anywhere on this path. The
   * function clears the GUC as its FIRST statement, re-derives the user from `app.user_id` and
   * re-validates an ACTIVE membership before setting it again — barrier B of two — so a
   * rejected target never becomes active and a previously established one never survives.
   *
   * THE RACE (fail closed). Between the application check above and this call, the membership
   * can be deactivated by a concurrent committed transaction. The function then refuses with
   * SQLSTATE `42501`, which the database adapter reports as {@link TenantContextRejectedError}.
   * The external answer must be the SAME `403 ACCESS_DENIED` as every other refusal, and must
   * disclose neither the SQLSTATE, nor the statement, nor the function name, nor the database
   * message, nor whether the requested practice exists.
   *
   * The mapping is deliberately as narrow as it can be: ONE `catch`, around ONE call, keyed on
   * a type the adapter raises for that ONE operation. There is no global translation of
   * PostgreSQL `42501` into a tenant `403` — an insufficient-privilege error from any other
   * statement (a revoked column grant, for instance) stays an internal failure, because
   * answering `403` for it would quietly convert a broken deployment into a routine refusal.
   */
  private async establishTenantContext(
    session: IdentityBootstrapSession,
    practiceId: string,
  ): Promise<void> {
    try {
      await session.setRequestContext(practiceId);
    } catch (error) {
      if (error instanceof TenantContextRejectedError) {
        throw accessDenied();
      }

      throw error;
    }
  }

  /**
   * Steps 8 and 9 — the effective tenant permissions of ONE membership in ONE practice.
   *
   * Both inputs are scoped to the admitted request and to nothing else: the roles of THAT
   * membership (never of another membership of the same user, and never of another user), and
   * the conditional flags of THAT practice (never of another practice). Platform roles are not
   * read, so they cannot contribute.
   *
   * Runs strictly AFTER `set_request_context`, which is required rather than incidental: from
   * package `013` onward `practice_settings` carries the §17.1 tenant policy, so without an
   * established `app.practice_id` the predicate is `practice_id = NULL` and the read returns
   * zero rows for every practice (D-049 clause 5, D-053 clause D.1).
   */
  private async derivePermissions(
    session: IdentityBootstrapSession,
    membershipId: string,
    practiceId: string,
  ): Promise<readonly Permission[]> {
    const roleRows = await session.findMembershipRoles([membershipId]);
    const roles = tenantRolesOf(membershipId, roleRows);

    const settings = await this.readConditionalSettings(session, practiceId);

    return resolveEffectivePermissions({
      // Already proven true by `admitActiveMembership`. Passed as a literal `true` would
      // bypass the resolver's own "an inactive membership grants nothing" rule (`15` §3.2);
      // this route reaches the resolver only for a membership it has already admitted, so the
      // rule stays a second, independent barrier rather than a restated fact.
      active: true,
      roles,
      settings,
    });
  }

  /**
   * The conditional flags of exactly one practice, fail-closed when there is no row (D-041).
   *
   * Reuses the narrow three-column `findConditionalSettings` unchanged. It is an INPUT to
   * permission derivation and never an output: nothing from `practice_settings` reaches any
   * response (`03` §10, §28.5, D-049). Widening it to the nine-column representation surface
   * belongs to the settings slice and is deliberately not done here.
   */
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
