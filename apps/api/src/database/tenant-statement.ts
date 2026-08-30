/**
 * The SMALL_ADAPTER seam — `P5_I4A_SESSION_REUSE = SMALL_ADAPTER` (D-073; `04` §7.5a).
 *
 * WHAT PROBLEM THIS SOLVES, AND WHY IT IS THIS SMALL
 *
 * A feature adapter — the patient-reference read of `P5-I4A`, and every tenant feature after it
 * — has to issue its OWN statement on the ALREADY-ADMITTED pinned session. Two obvious shapes
 * were both refused by the accepted decisions:
 *
 * - putting `findPatientReference(...)` on {@link IdentityBootstrapSession} would move
 *   feature-specific database behaviour into the identity port, which D-073 forbids by name.
 *   The identity port would then acquire a new method per feature and stop being an identity
 *   port at all;
 * - handing the feature adapter a `PrismaService`, a `PrismaClient` or a second transaction
 *   would create the parallel database stack D-054 clauses 7 and 8 and D-056 clause 5 forbid.
 *
 * What is left is exactly this: a value object describing ONE already-built, fully parameterised
 * statement, which the pinned session executes on the connection it already holds. The feature
 * owns its SQL; the session owns the connection; neither acquires the other's job.
 *
 * IT IS NOT A QUERY BUILDER AND MUST NOT BECOME ONE. There is no fragment composition, no
 * identifier interpolation, no `WHERE`-clause assembly and no `Prisma.raw` anywhere on this path.
 * A statement is built ONCE, in one feature adapter, with `Prisma.sql` — the `sql-template-tag`
 * tag, so every interpolated value becomes a bound placeholder and travels out of band.
 */

import { type Prisma } from '../generated/prisma/client.js';

/**
 * ONE feature-owned statement, ready to run on an admitted pinned session.
 *
 * WHY THERE IS A `label` AS WELL AS THE SQL
 *
 * The label is a SOURCE-CODE LITERAL owned by the feature adapter, in the same spelling the
 * recording session harness logs for every identity statement (`select practice(...)` and its
 * neighbours). It is what lets a behavioural spec assert the exact ORDER of executed statements
 * without parsing SQL, and what lets a test double model a statement without becoming a second
 * SQL engine.
 *
 * It must therefore never carry a value: no identifier, no practice id, no resource id, no
 * header and no user input. It names WHICH statement ran, never WHAT it ran on.
 */
export interface TenantStatement {
  /** Stable, non-secret source-code label. Contains no value and no SQL. */
  readonly label: string;
  /**
   * The complete, fully parameterised statement.
   *
   * Every value is a BOUND parameter. `Prisma.sql` is the only accepted way to build one, and
   * `Prisma.raw`, `$queryRawUnsafe` and string concatenation of SQL are not used anywhere on
   * this path.
   */
  readonly sql: Prisma.Sql;
}

/**
 * The statement surface of ONE ADMITTED tenant request.
 *
 * It is obtainable ONLY from {@link TenantDatabaseService.forAdmittedRequest}, and that method
 * requires an `AdmittedTenantRequest` — a frozen value object which only
 * `TenantRequestPipeline.admit` can produce, and only after every step of `03` §3.7.1 has
 * passed. A feature adapter therefore cannot reach the database before admission: there is no
 * constructor, no factory and no injectable token that would hand it one.
 *
 * It holds no client, opens no transaction, establishes no identity and sets no
 * `app.practice_id`. Everything it can do, the pinned session was already able to do.
 */
export interface AdmittedTenantSession {
  /**
   * The ADMITTED practice — the value now in `app.practice_id` for this transaction.
   *
   * It is exposed so that a feature statement can carry the EXPLICIT tenant predicate that
   * D-073 requires as the second barrier, and it is the only practice id a feature adapter is
   * ever given. It is never a path segment, a header or a body member that has not been through
   * the tenant pipeline.
   */
  readonly practiceId: string;

  /**
   * Runs ONE feature statement on the pinned connection of the admitted request.
   *
   * There is no transaction parameter, no isolation level and no callback: the transaction is
   * the one the authenticated session already opened, and this method cannot open, nest or
   * parallel it.
   */
  run<TRow>(statement: TenantStatement): Promise<readonly TRow[]>;
}
