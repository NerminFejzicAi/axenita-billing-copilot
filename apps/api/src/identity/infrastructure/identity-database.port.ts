/**
 * The database port of the phase 3 identity bootstrap.
 *
 * WHY A PORT EXISTS AT ALL
 *
 * The single most important property of `GET /me` is not which rows it reads but WHERE it reads
 * them: the whole chain — `set_auth_subject_context`, the bootstrap `users` read, the status
 * check, `set_user_context`, and every RLS dependent read after it — has to happen inside ONE
 * interactive transaction on ONE pinned connection (D-047 clause 8, `03` §3.1, `05` phase 3
 * "Cijeli bootstrap lanac izvršava se u jednoj interaktivnoj transakciji").
 *
 * Modelling that as a session object handed to a callback makes the property structural rather
 * than a convention: the application service never holds a database client, so it CANNOT issue a
 * read outside the transaction even by accident, and a test can substitute a recording session
 * and assert the exact call order that the accepted decisions prescribe.
 *
 * COLUMN DISCIPLINE
 *
 * Every query below names its columns. `SELECT *` is impossible on `users`, `practices` and
 * `practice_settings` anyway — those tables carry column level grants only, and a forbidden
 * column fails with SQLSTATE `42501` (`02` §20.2a, §20.2b) — but the same discipline is applied
 * everywhere so a future grant widening cannot silently widen a response.
 */

/**
 * The `users` row of the bootstrap read.
 *
 * `status` is included because the admission decision needs it (D-047 clause 4) and excluded
 * from the response DTO because `03` §10 does not contain it. `auth_subject` and `last_login_at`
 * are absent: they have no runtime column grant at all.
 */
export interface BootstrapUserRow {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly preferredLanguage: string;
  readonly status: string;
}

/** One `practice_memberships` row of the authenticated user. */
export interface MembershipRow {
  readonly id: string;
  readonly practiceId: string;
  readonly active: boolean;
}

/** One `practice_membership_roles` assignment, scoped to a membership of the current user. */
export interface MembershipRoleRow {
  readonly membershipId: string;
  readonly practiceId: string;
  readonly role: string;
}

/** The practice identity `GET /me` renders — `practiceName` and nothing else (`03` §10). */
export interface PracticeRow {
  readonly id: string;
  readonly name: string;
}

/**
 * The practice `GET /practices/{practiceId}` renders, plus nothing beyond it.
 *
 * These are EXACTLY the six columns `copilot_app` is granted on `practices` (`02` §20.2a,
 * D-047 clause 6) and exactly the six members of the accepted response projection
 * (`03` §"GET `/practices/{practiceId}`"). `legal_name`, `zsr_number`, `gln_number`,
 * `created_at` and `updated_at` have no grant at all, so they cannot be selected even by
 * mistake — a statement that names one fails with SQLSTATE `42501`.
 *
 * `status` is read because the admission decision needs it: a practice whose status is not
 * `ACTIVE` is rejected with a rollback (D-047 clause 10). It is also part of the accepted
 * response, so it is the one column that is both an input and an output here.
 */
export interface RequestedPracticeRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly defaultLanguage: string;
  readonly timezone: string;
  readonly status: string;
}

/**
 * The three columns `copilot_app` may read from `practice_settings` in phase 3 (`02` §20.2b,
 * D-049 clause 3).
 *
 * They are an INPUT to conditional permission derivation and are never rendered into the
 * response (`03` §10, §28.5).
 */
export interface ConditionalSettingsRow {
  readonly practiceId: string;
  readonly allowMpaApproval: boolean;
  readonly allowBillingSpecialistApproval: boolean;
}

/**
 * `app_security.set_request_context` refused to establish the tenant context.
 *
 * The function raises SQLSTATE `42501` for exactly three reasons (`02` §16.2.3, D-033 clauses
 * 9–11): `app.user_id` is not established, the caller holds no membership in the requested
 * practice, or the membership exists but is not `ACTIVE`. A tenant route has already ruled out
 * all three at the application layer BEFORE it calls the function, so in practice this error
 * means the facts changed underneath the request — most plausibly a concurrent transaction
 * deactivating the membership between the application check and this call.
 *
 * WHY A TYPE AND NOT A SQLSTATE STRING. The knowledge that a refusal is SQLSTATE `42501`, that
 * the driver reports it in one shape rather than another, and that the statement was a
 * `select app_security.set_request_context(...)` all belong to the database adapter. The
 * application layer must be able to answer `403 ACCESS_DENIED` for THIS operation without
 * acquiring any of it, and without a global "42501 means forbidden" rule that would also
 * swallow an insufficient-privilege failure caused by a revoked grant somewhere else.
 *
 * The message is static and server-side only. It names no practice, no user, no membership and
 * no database message, so it can never carry a tenant fact into a log line (`09` §11), and the
 * one caller that catches it replaces it with the shared refusal before it reaches any filter.
 */
export class TenantContextRejectedError extends Error {
  public constructor() {
    super(
      'app_security.set_request_context refused to establish the requested tenant context ' +
        '(SQLSTATE 42501).',
    );
    this.name = 'TenantContextRejectedError';
  }
}

/**
 * One current platform role assignment.
 *
 * Only `platform_role` is projected. `granted_by`, `granted_at`, `revoked_at` and `revoked_by`
 * are internal columns and are not part of the `GET /me` contract; `revoked_at` is used as a
 * filter inside the query and never leaves the database layer.
 */
export interface PlatformRoleRow {
  readonly platformRole: string;
}

/**
 * One pinned transactional database context.
 *
 * Every method executes on the same connection, inside the same interactive transaction, in the
 * order the caller invokes them. No method opens a transaction of its own and no method may be
 * called after the callback returned.
 */
export interface IdentityBootstrapSession {
  /**
   * `app_security.set_auth_subject_context(<verified subject>)` — `02` §16.2.4, D-047 clauses
   * 1–2. The function's semantics (clearing `app.user_id` and `app.practice_id`, rejecting an
   * empty subject with `42501`) belong to the database and are not reimplemented in TypeScript.
   */
  setAuthSubjectContext(authSubject: string): Promise<void>;

  /**
   * Reads `users` through the bootstrap policy of `02` §17.5.
   *
   * The query deliberately carries NO `WHERE auth_subject = ...`: the policy itself filters on
   * `app.auth_subject` and returns at most one row (`03` §3.1 step 3). Naming the column would
   * additionally fail with `42501`, because it has no grant.
   *
   * Returns every visible row rather than a single one, so that the caller can treat "more than
   * one" as the invariant violation it is instead of silently picking one.
   */
  findUsersForVerifiedSubject(): Promise<readonly BootstrapUserRow[]>;

  /**
   * `app_security.set_user_context(<users.id>)` — `02` §16.2.2, D-033 clauses 3–4.
   *
   * Called only after an `ACTIVE` user has been resolved (D-047 clauses 4 and 9).
   */
  setUserContext(userId: string): Promise<void>;

  /**
   * Reads the memberships of exactly one user.
   *
   * `practice_memberships` intentionally has NO row level security in phase 3 — its bootstrap
   * policy belongs to phase 4 and package `013_rls_policies` (`02` §17.3, D-033). The user
   * scoping is therefore an explicit `WHERE user_id = $1` in this query and must never be
   * relaxed into "read and filter afterwards".
   */
  findMemberships(userId: string): Promise<readonly MembershipRow[]>;

  /**
   * `app_security.set_request_context(<practice id>)` — `02` §16.2.3, D-033 clauses 7–12,
   * D-053 clauses D.5 and D.7.
   *
   * THE ONLY ACCEPTED WAY TO ESTABLISH `app.practice_id`. The application never issues
   * `set_config('app.practice_id', ...)` itself: the function re-derives the user from
   * `app.user_id`, re-validates an ACTIVE `practice_memberships` row for it, and clears the GUC
   * as its FIRST statement, so a rejected target never becomes active and a previously
   * established one never survives the rejection (D-033 clauses 10 and 12). Setting the GUC
   * directly would skip all three properties.
   *
   * `practiceId` must come from an ALREADY-RESOLVED membership row of `app.user_id`. No header,
   * query, body or path value may reach this method on the neutral `/me` route (D-053 clause
   * D.6); the function would reject a foreign practice with `42501` in any case, but the
   * application must not depend on that as its only barrier.
   *
   * An inactive membership raises `42501`, which is exactly why `/me` must not call this for one
   * (D-053 clause D.4).
   *
   * On a tenant route the practice id is the CLIENT-NAMED one, and it may reach this method
   * only after the whole of `03` §3.7.1 steps 1 to 4 has passed: user admission, header
   * validation, path/header match, the membership-scoped practice status check and the
   * application-level ACTIVE membership check (D-047 clause 10). The function then validates
   * the ACTIVE membership INDEPENDENTLY — the two barriers are cumulative and neither replaces
   * the other.
   *
   * @throws TenantContextRejectedError when the database refuses with SQLSTATE `42501`. Every
   *   implementation must translate that ONE refusal of THIS ONE operation, and must translate
   *   no other error, so that the application layer can fail closed without ever inspecting a
   *   driver error.
   */
  setRequestContext(practiceId: string): Promise<void>;

  /**
   * Reads ONE membership: the CURRENT AUTHENTICATED user's membership in one practice.
   *
   * THE USER IS NOT A PARAMETER, AND THAT IS THE POINT (D-054 clause 12).
   *
   * The predecessor of this method took `(userId, practiceId)`. Its single call site passed the
   * admitted user, so it was correct — but the SHAPE let a caller ask "authorise practice P using
   * user U2" while the authenticated identity was U1, and D-054 clause 12 requires the wrong user
   * to be mechanically INEXPRESSIBLE before any further tenant route is added. The user is
   * therefore derived inside the statement, from the transaction-local `app.user_id` established
   * by {@link setUserContext} on this very session, and there is no parameter through which a
   * second identity could enter.
   *
   * That derivation is a genuine trust boundary rather than a restatement: `app.user_id` is
   * written ONLY by the authenticated bootstrap path, never from client input, and it lives on
   * the same pinned connection inside the same interactive transaction as this read. An
   * implementation must therefore bind the user through the established context — the canonical
   * predicate is `nullif(current_setting('app.user_id', true), '')::uuid`, the same one the
   * accepted policies use — and must never accept it from its caller. With no context
   * established the predicate is NULL and the statement returns zero rows, which fails closed.
   *
   * This remains the application-layer narrowing D-047 clause 18 assigns to this route: the
   * binding between the current user and the REQUESTED practice is an explicit predicate of ONE
   * statement. Reading a user's memberships and picking the matching one in memory would be a
   * weaker, and therefore wrong, implementation of the same requirement.
   *
   * At most one row can match: `practice_memberships` carries `unique (practice_id, user_id)`
   * (`02` §6.3), so `undefined` unambiguously means "the current user has no membership in this
   * practice".
   */
  findCurrentUserMembershipInPractice(practiceId: string): Promise<MembershipRow | undefined>;

  /**
   * Reads the requested practice by id, through the `02` §17.6 membership policy.
   *
   * This is step 4 of `03` §3.7.1 and of D-047 clause 10 — the membership-scoped read of the
   * requested practice's `status`, performed BEFORE any tenant context would be established.
   * The policy is what makes it membership-scoped: it exposes a practice only when the caller
   * holds a `practice_memberships` row in it, so a practice that does not exist and a practice
   * the caller is not a member of both yield `undefined`. That indistinguishability is required
   * (`03`, negative cases) and prevents enumeration.
   *
   * The policy deliberately does not filter `pm.active`, so an inactive membership still makes
   * the row visible. Visibility is not authorisation: the active-membership and `practice.read`
   * decisions are taken separately, by the caller of this method.
   *
   * At most one row can match, because `id` is the primary key.
   */
  findRequestedPractice(practiceId: string): Promise<RequestedPracticeRow | undefined>;

  /**
   * Reads the role assignments of the given memberships under the `02` §17.4 policy.
   *
   * The policy already restricts visibility to memberships of `app.user_id`; the explicit
   * membership filter narrows further and keeps the query honest if the policy ever changes.
   */
  findMembershipRoles(membershipIds: readonly string[]): Promise<readonly MembershipRoleRow[]>;

  /**
   * Reads the practices of the given memberships under the `02` §17.6 membership policy.
   *
   * The policy works before `app.practice_id` exists and deliberately does not filter
   * `pm.active`, which is what lets an inactive membership still render its `practiceName`
   * (`03` §10).
   *
   * CALL ORDER IS LOAD-BEARING FROM PACKAGE `013` ONWARD. `practices_context_narrow` (§17.6) is
   * RESTRICTIVE, so once `app.practice_id` exists this read narrows to exactly ONE practice. On
   * `/me` it must therefore complete BEFORE the first {@link setRequestContext}, or only the
   * membership whose context happens to be established would keep its `practiceName`
   * (D-053 clause D.10).
   */
  findPractices(practiceIds: readonly string[]): Promise<readonly PracticeRow[]>;

  /**
   * Reads the conditional approval flags of the given practices, under strict tenant RLS.
   *
   * From package `013` onward `practice_settings` carries the §17.1 tenant policy: without an
   * established `app.practice_id` the predicate is `practice_id = NULL` and the statement
   * returns ZERO ROWS for every practice, and with one established it can only ever return that
   * one practice's row (D-049 clause 5, D-053 clause D.1). The caller must therefore have
   * established tenant context through {@link setRequestContext} first.
   *
   * The explicit practice id filter is kept as a SECOND barrier, not as the only one: it was the
   * whole control in phase 3 (the named `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS
   * READ EXPOSURE` of D-049 clause 3, now closed), and dropping it would leave the application
   * unable to state which practice it believes it is reading. Reading every row and filtering in
   * memory remains forbidden.
   */
  findConditionalSettings(
    practiceIds: readonly string[],
  ): Promise<readonly ConditionalSettingsRow[]>;

  /**
   * Reads the current platform role assignments of the authenticated user.
   *
   * Two independent restrictions apply and both are required: the `02` §17.2 policy restricts
   * rows to `app.user_id`, and the query itself filters `revoked_at IS NULL`, because D-051
   * clause 3 leaves revoked row filtering to the application. A revoked assignment must never
   * appear in `platformRoles[]`.
   */
  findCurrentPlatformRoles(userId: string): Promise<readonly PlatformRoleRow[]>;
}

/**
 * Opens exactly one interactive transaction and runs the bootstrap inside it.
 *
 * A thrown error rolls the transaction back, which discards every transaction local `app.*`
 * setting — `set_config(..., true)` in both context functions — so a failed request leaves no
 * usable context behind and a pooled connection inherits nothing (`02` §16.2, `08` §21.5.7).
 */
export interface IdentityDatabase {
  runBootstrapTransaction<T>(work: (session: IdentityBootstrapSession) => Promise<T>): Promise<T>;
}

/** Injection token for {@link IdentityDatabase}. */
export const IDENTITY_DATABASE = Symbol('IdentityDatabase');
