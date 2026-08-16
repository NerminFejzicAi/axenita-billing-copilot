/**
 * `GET /api/v1/practices/{practiceId}/settings` response contract.
 *
 * Normative sources: D-053 clauses A.1, A.2 and A.4 (the frozen representation, the `ETag`
 * channel and the columns that stay unreadable); `03` §10 and §28.5; `15` §5; D-044 and D-049
 * (the permission stays `PRACTICE_ADMIN` only); D-047 clause 10 and `03` §3.7.1 (the tenant
 * route class).
 *
 * `/practices/{practiceId}/settings` is a TENANT route (`03` §3.4): `X-Practice-ID` is mandatory,
 * the `practiceId` of the path must name the very same practice, and the required permission is
 * `practice.settings.read`.
 *
 * EXACTLY EIGHT FIELDS, AND `version` IS NOT ONE OF THEM
 *
 * D-053 clause A.1 freezes the representation at the eight members below. Clause A.2 then fixes
 * where the row's `version` travels: there is EXACTLY ONE channel for the current version of the
 * resource, and it is the `ETag` response header. Publishing `version` as a ninth field would
 * create a second channel, and two channels can disagree — which is precisely what the
 * optimistic-locking contract of `03` §5.2 cannot tolerate. It is therefore absent from this
 * type, and must stay absent: a `PATCH` request never carries it either (clause B.6).
 *
 * What this contract deliberately does NOT contain, beyond `version`:
 *
 * - `id`, `configuration` and `updatedBy`. They are not merely omitted from the projection:
 *   `copilot_app` holds no `SELECT` grant on any of them (D-053 clauses A.3 and A.4), so they
 *   are unreachable at the database level too — a statement that names one fails with SQLSTATE
 *   `42501`, even in a `WHERE` predicate or an `ORDER BY`;
 * - `updatedAt`. It is WRITABLE by the phase 4 `UPDATE` surface and deliberately NOT readable:
 *   internal metadata is not exposed merely because it exists in the table (clause A.4).
 *
 * The DTO is deliberately HTTP-shaped, in `camelCase`. No database-shaped `snake_case` type is
 * published here, so a widening of a column grant or of the Prisma model cannot reach a response
 * through this package.
 *
 * This file describes the `GET` document only. `PATCH /practices/{practiceId}/settings` — its
 * request body, its mandatory `If-Match`, `428 PRECONDITION_REQUIRED` and `409 VERSION_CONFLICT`
 * (D-053 clause B.4) — belongs to a later slice and is not declared here, not even as a stub.
 */

/**
 * The complete `GET /practices/{practiceId}/settings` document (D-053 clause A.1).
 *
 * `practiceId` is the ADMITTED practice — the value in `app.practice_id` for the transaction
 * that produced this document, and therefore the practice of both the path and `X-Practice-ID`.
 * It can never be another tenant's identifier: the row is read under the `02` §17.1 tenant
 * policy, which exposes no other practice at all.
 *
 * Six of the remaining seven members are `boolean`, exactly as the `practice_settings` columns
 * are (`02` §6.4). `retentionPolicyCode` is the one nullable member — the column is
 * `varchar(100) NULL` — and `null` is rendered as `null` rather than omitted, so the key set of
 * the document is the same eight names for every practice.
 */
export interface PracticeSettingsResponseDto {
  readonly practiceId: string;
  readonly billingReviewRequired: boolean;
  readonly allowMpaApproval: boolean;
  readonly allowBillingSpecialistApproval: boolean;
  readonly requireReasonForManualChange: boolean;
  readonly aiEnabled: boolean;
  readonly axenitaExportEnabled: boolean;
  readonly retentionPolicyCode: string | null;
}
