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
   * Reads ONE membership, bound to one user and one practice at the same time.
   *
   * This is the application-layer narrowing D-047 clause 18 assigns to phase 3 for
   * `GET /practices/{practiceId}`: `practice_memberships` gets its own user-scoped policy only
   * in phase 4 (`02` §17.3, package `013`), so the binding between the resolved current user and
   * the REQUESTED practice has to be an explicit predicate of this statement. Reading a user's
   * memberships and picking the matching one in memory would be a weaker, and therefore wrong,
   * implementation of the same requirement.
   *
   * At most one row can match: `practice_memberships` carries `unique (practice_id, user_id)`
   * (`02` §6.3), so `undefined` unambiguously means "this user has no membership in this
   * practice".
   */
  findMembershipInPractice(userId: string, practiceId: string): Promise<MembershipRow | undefined>;

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
   * (`03` §10). Phase 3 never sets `app.practice_id`, so the RESTRICTIVE narrowing branch stays
   * inert.
   */
  findPractices(practiceIds: readonly string[]): Promise<readonly PracticeRow[]>;

  /**
   * Reads the conditional approval flags of the given practices.
   *
   * `practice_settings` has broad row visibility in phase 3 — it carries no RLS policy, only a
   * three column grant (D-049, the named `PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS
   * READ EXPOSURE`). The application must therefore scope the query itself, which is exactly
   * what the practice id filter does. Reading every row and filtering in memory is forbidden.
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
