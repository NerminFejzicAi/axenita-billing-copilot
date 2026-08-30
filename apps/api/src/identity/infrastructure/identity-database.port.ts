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

import { type TenantStatement } from '../../database/tenant-statement.js';

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
 * The nine columns `copilot_app` may read from `practice_settings` from package `013` onward
 * (`02` §20.2b.1, D-053 clauses A.3 and A.4).
 *
 * Eight of them carry the frozen `GET /practices/{practiceId}/settings` representation of D-053
 * clause A.1; the ninth, `version`, carries the `ETag` of clause A.2 and is the ONLY member here
 * that never reaches the response body.
 *
 * THIS IS NOT A WIDENING OF {@link ConditionalSettingsRow}, AND THE TWO MUST NOT MERGE. The three
 * column surface above is an INPUT to permission derivation, read at step 9 of `03` §3.7.1 to
 * decide whether the caller may proceed at all; this one is an OUTPUT, read at step 11 to build a
 * document the caller has already been authorised to receive. Deriving the authorisation input
 * from the representation would mean a route computed its own permission from the very row it is
 * about to return, which is the inversion `03` §28.5 forbids. They therefore stay two statements
 * with two shapes and two call sites.
 *
 * `id`, `configuration`, `updated_at` and `updated_by` are absent here AND unreachable: they
 * carry no `SELECT` grant, so naming one anywhere in a statement — including in a `WHERE`
 * predicate or an `ORDER BY` — fails with SQLSTATE `42501` (D-053 clause A.4).
 */
export interface PracticeSettingsRow {
  readonly practiceId: string;
  readonly billingReviewRequired: boolean;
  readonly allowMpaApproval: boolean;
  readonly allowBillingSpecialistApproval: boolean;
  readonly requireReasonForManualChange: boolean;
  readonly aiEnabled: boolean;
  readonly axenitaExportEnabled: boolean;
  readonly retentionPolicyCode: string | null;
  /** `practice_settings.version` (`02` §6.4) — the value of the strong `ETag`, never a field. */
  readonly version: number;
}

/**
 * ONE assignment of ONE accepted mutable `practice_settings` column — a CLOSED discriminated
 * union over the seven business fields of D-053 clause B.1 and D-055 clauses 14 and 18.
 *
 * WHY A UNION AND NOT `Partial<PracticeSettingsRow>`
 *
 * A partial record cannot distinguish "the caller omitted this field" from "the caller submitted
 * `undefined`", because both are `undefined` at the type level and both are `undefined` at
 * runtime. On a write path that difference is the whole contract: an omitted field must not be
 * assigned AT ALL (D-055 clause 17 — the statement sets only the SUBMITTED business fields),
 * while a value bound as `undefined` would reach the database as SQL `NULL` and silently blank a
 * `NOT NULL boolean` column or erase a retention code nobody asked to erase.
 *
 * This shape makes that mistake unexpressible rather than merely forbidden:
 *
 * - a boolean member can carry ONLY a `boolean` — never `null`, never `undefined`;
 * - `retentionPolicyCode` is the one member whose column is nullable, so it alone carries
 *   `string | null`, and `null` there is a REQUESTED SQL `NULL` rather than an absence;
 * - `undefined` is not a member of any variant, so an omitted field has no representation and
 *   simply is not in the collection.
 *
 * The `field` discriminant is a literal from a fixed set, which is also what lets the database
 * adapter select a COLUMN SQL FRAGMENT by an exhaustive `switch` over source-code literals. No
 * client string ever becomes an identifier.
 */
export type PracticeSettingsAssignment =
  | { readonly field: 'billingReviewRequired'; readonly value: boolean }
  | { readonly field: 'allowMpaApproval'; readonly value: boolean }
  | { readonly field: 'allowBillingSpecialistApproval'; readonly value: boolean }
  | { readonly field: 'requireReasonForManualChange'; readonly value: boolean }
  | { readonly field: 'aiEnabled'; readonly value: boolean }
  | { readonly field: 'axenitaExportEnabled'; readonly value: boolean }
  | { readonly field: 'retentionPolicyCode'; readonly value: string | null };

/**
 * A STRUCTURALLY NON-EMPTY collection of assignments.
 *
 * The empty patch of D-055 clause 14 is refused in the application layer, before any write, and
 * this type is what stops that refusal from being a rule someone can forget. An `UPDATE` built
 * from zero business assignments would still set `version = version + 1` and `updated_at`, so it
 * would consume a version for a request that asked for nothing — exactly what clause 14 forbids.
 * A non-empty tuple type means such a call does not type-check.
 */
export type PracticeSettingsAssignments = readonly [
  PracticeSettingsAssignment,
  ...PracticeSettingsAssignment[],
];

/** Everything the ONE optimistic-concurrency statement of D-055 clause 15 needs. */
export interface PracticeSettingsUpdate {
  /**
   * The ADMITTED practice — the value already in `app.practice_id` for this transaction, never a
   * path segment, a header or a body member that has not been through the tenant pipeline.
   */
  readonly practiceId: string;
  /**
   * The version the caller asserted through `If-Match`, already proven to be a non-negative
   * integer within PostgreSQL `int4`.
   */
  readonly expectedVersion: number;
  /** The submitted business fields, and only those. */
  readonly assignments: PracticeSettingsAssignments;
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
   * Reads the SETTINGS REPRESENTATION of exactly one practice — step 11 of the settings route.
   *
   * A SECOND STATEMENT, DELIBERATELY. {@link findConditionalSettings} is not widened to serve
   * both: it remains the three-column permission-derivation input of step 9, and this is the
   * nine-column representation read of step 11. Merging them would make one query answer both
   * "may the caller proceed?" and "what does the caller receive?", so a future change to the
   * response surface would silently change an authorisation input.
   *
   * CALL ORDER IS LOAD-BEARING. `practice_settings_select` (`02` §17.1) is the primary tenant
   * barrier and its predicate is `practice_id = app.practice_id`. Called before
   * {@link setRequestContext}, the predicate is `practice_id = NULL` and the statement returns
   * ZERO ROWS for every practice; called after it, it can only ever return the admitted tenant's
   * row (D-049 clause 5, D-053 clause D.1). This method must therefore be called only for an
   * already-admitted request, and `practiceId` must be that admitted practice — which is what
   * makes the explicit predicate and the policy agree by construction.
   *
   * The explicit `practice_id` filter is kept on top of the policy as the second barrier, exactly
   * as `findConditionalSettings` keeps it: the application must be able to state which practice it
   * believes it is reading. Reading every row and filtering in memory remains forbidden.
   *
   * `undefined` means the admitted practice has NO settings row. It is not an authorisation
   * outcome and must never be answered as one — see the invariant handling in the settings read
   * service.
   *
   * At most one row can match: `practice_settings` carries `unique (practice_id)` (`02` §6.4).
   */
  findPracticeSettings(practiceId: string): Promise<PracticeSettingsRow | undefined>;

  /**
   * The ONE optimistic-concurrency write of `practice_settings` — D-055 clauses 15 to 23.
   *
   * EXACTLY ONE STATEMENT, AND IT IS AN `UPDATE ... RETURNING`. There is no read before it and no
   * read after it. The expected version comes only from `If-Match` and its currency is decided
   * only by the statement's own predicate (clause 16), so no window exists between checking a
   * version and writing against it. The success representation and the new `ETag` are both built
   * from the row this statement returns (clause 23), so the body and the validator can never
   * describe two different states.
   *
   * THE PREDICATE IS `practice_id = <admitted> AND version = <expected>` (clause 15). Both halves
   * are mandatory. The `02` §17.1 tenant policy is the primary control — without
   * `app.practice_id` the policy predicate is `practice_id = NULL` and the statement matches
   * nothing at all — and the explicit `practice_id` term is the second barrier, exactly as both
   * read statements keep it.
   *
   * WHAT IT WRITES: the submitted business fields, `version = version + 1` and `updated_at`
   * (clause 17). `updated_by`, `practice_id`, `id` and `configuration` are NOT written; the first
   * two are named by clause 17 and clause 18, and the last two carry no `UPDATE` grant at all
   * (`02` §20.2b.1), so naming one fails with SQLSTATE `42501`.
   *
   * WHAT IT RETURNS: exactly the nine SELECT-granted columns of {@link PracticeSettingsRow}.
   * `updated_at` is deliberately NOT among them — it carries an `UPDATE` grant but no `SELECT`
   * grant, so `RETURNING updated_at` would fail with `42501`.
   *
   * `undefined` MEANS "ZERO ROWS", AND NOTHING MORE SPECIFIC. It is the outcome of a stale
   * version, of an absent `practice_settings` row and of a row the tenant policy does not expose,
   * and the port deliberately cannot tell the caller which. D-055 clauses 19 to 21 give all three
   * the same `409 VERSION_CONFLICT` and forbid the second read that would discriminate them: that
   * read is race-prone by construction and would disclose internal state the contract never
   * promised.
   *
   * At most one row can match, because `practice_settings` carries `unique (practice_id)`
   * (`02` §6.4).
   */
  updatePracticeSettings(update: PracticeSettingsUpdate): Promise<PracticeSettingsRow | undefined>;

  /**
   * Reads the current platform role assignments of the authenticated user.
   *
   * Two independent restrictions apply and both are required: the `02` §17.2 policy restricts
   * rows to `app.user_id`, and the query itself filters `revoked_at IS NULL`, because D-051
   * clause 3 leaves revoked row filtering to the application. A revoked assignment must never
   * appear in `platformRoles[]`.
   */
  findCurrentPlatformRoles(userId: string): Promise<readonly PlatformRoleRow[]>;

  /**
   * THE SMALL_ADAPTER SEAM — runs ONE FEATURE-OWNED statement on this pinned session
   * (`P5_I4A_SESSION_REUSE = SMALL_ADAPTER`; D-073; D-054 clauses 6–8; D-056 clause 5).
   *
   * IT IS DELIBERATELY THE ONLY METHOD HERE THAT NAMES NO TABLE. Every other method above is a
   * statement this port OWNS, because it is part of the identity/tenant admission chain. A
   * feature read is not: `03` §11 gives the patient-reference statement to the patient-reference
   * feature, and D-073 states that "feature-specifično patient-reference DB ponašanje ostaje u
   * feature adapteru". Adding `findPatientReference(...)` here would move it out of the feature
   * and into the identity port, one method per feature, until this interface described the whole
   * application.
   *
   * SO THE FEATURE BRINGS THE STATEMENT AND THE SESSION BRINGS THE CONNECTION. The statement is
   * built once, in the feature adapter, fully parameterised; this method executes it on the very
   * connection the authenticated transaction pinned, inside that same transaction. It opens no
   * transaction, nests none, starts none in parallel, establishes no identity and sets no
   * `app.practice_id`. There is nothing it can do that the caller of `runBootstrapTransaction`
   * could not already do — which is exactly what makes it a SMALL adapter rather than a second
   * database stack.
   *
   * IT IS NOT A BACK DOOR INTO RAW SQL FOR BUSINESS CODE. Reaching it requires building a
   * {@link TenantStatement}, which requires `Prisma.sql`, which application services and
   * controllers may not import at all — a permanent static import/source-boundary test proves
   * that, and a behavioural recording-session test proves the ordering (D-072, `OD-P5-I4-12`;
   * `08` §12.10, points 1 and 2). The accepted route from an application service to this method
   * is: the admitted request, the `TenantDatabaseService` facade, then the feature adapter.
   *
   * CALL ORDER IS LOAD-BEARING. A tenant feature statement runs under the `02` §17.1-shaped
   * tenant policy of its own table, so it must be reached only AFTER `set_request_context`. With
   * no `app.practice_id` established the policy predicate is `practice_id = NULL` and the
   * statement returns zero rows — fail closed — which is not a substitute for calling it in the
   * right place.
   */
  runTenantStatement<TRow>(statement: TenantStatement): Promise<readonly TRow[]>;
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
