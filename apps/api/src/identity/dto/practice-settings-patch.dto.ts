/**
 * The accepted `PATCH /api/v1/practices/{practiceId}/settings` request body.
 *
 * Normative sources: D-053 clauses B.1 and B.6; D-055 clauses 14, 17 and 18; `02` §6.4 and
 * §20.2b.1 (the nine `UPDATE` columns and the `varchar(100)` retention column); `00` §8.4.
 *
 * EXACTLY SEVEN MUTABLE FIELDS, AND NOTHING ELSE
 *
 * The set is frozen by D-053 and restated verbatim by D-055 clause 14. Nothing else is accepted,
 * and the shared `whitelist` / `forbidNonWhitelisted` configuration turns an unmodelled member
 * into an explicit `422 VALIDATION_ERROR` with `UNKNOWN_FIELD` rather than a silent drop. In
 * particular `version`, `updatedAt` and `updatedBy` are NOT accepted here (D-053 clause B.6):
 * `version` travels only in the `ETag`/`If-Match` channel, and the other two are written by the
 * database or not at all.
 *
 * WHY `@IsOptional()` IS NOT USED ON THE BOOLEANS
 *
 * `@IsOptional()` skips validation when the value is `undefined` OR `null`. For these six fields
 * that is exactly wrong: `null` is not "the field was omitted", it is a submitted value of the
 * wrong type, and `@IsOptional()` would let it through validation and then leave the write path
 * to decide what `null` means for a `NOT NULL boolean` column. `@ValidateIf` narrowed to
 * `value !== undefined` keeps the omitted case skipped and drives `null` into `@IsBoolean()`,
 * which is the `422 INVALID_BOOLEAN` the contract requires.
 *
 * `retentionPolicyCode` is the one field where `null` IS a submitted value, because the column is
 * nullable, so its condition excludes `null` as well — but for the opposite reason: not to skip a
 * fault, but to admit a legal value.
 *
 * OMITTED IS NOT `undefined`, AND THIS CLASS CANNOT TELL THEM APART
 *
 * A validated instance of this DTO answers "is every submitted value acceptable?" and NOTHING
 * else. It cannot answer "which fields did the caller actually send?", because a compiled class
 * field and `class-transformer` may both materialise an omitted property as an own property whose
 * value is `undefined`. The write path therefore derives presence from `Object.hasOwn` over the
 * RAW parsed body and never from this instance — see `PracticeSettingsWriteService`. That is a
 * correctness requirement, not a style choice: `false` and `null` are submitted values, and a
 * presence rule based on truthiness or on this object's own keys would either drop them or invent
 * assignments the caller never made.
 */

import { IsBoolean, IsString, MaxLength, ValidateIf } from 'class-validator';

/**
 * The maximum length of `practice_settings.retention_policy_code` (`02` §6.4, `varchar(100)`).
 *
 * DERIVED CANONICAL, not invented. The database is the authority and remains the backstop — a
 * longer value assigned into the column raises PostgreSQL `22001` — but a client input defect
 * must not reach the database as a generic driver failure and surface as `500 INTERNAL_ERROR`.
 * Validating the same bound at the edge turns it into the `422 INVALID_LENGTH` the caller can act
 * on, and leaves the column constraint as defence in depth rather than as the only control.
 */
const RETENTION_POLICY_CODE_MAX_LENGTH = 100;

/** A condition that skips validation for an OMITTED field and for nothing else. */
function submitted(_object: unknown, value: unknown): boolean {
  return value !== undefined;
}

/** A condition that skips validation for an omitted field and for an explicit `null`. */
function submittedAndNotNull(_object: unknown, value: unknown): boolean {
  return value !== undefined && value !== null;
}

export class PracticeSettingsPatchDto {
  @ValidateIf(submitted)
  @IsBoolean()
  public readonly billingReviewRequired?: boolean;

  @ValidateIf(submitted)
  @IsBoolean()
  public readonly allowMpaApproval?: boolean;

  @ValidateIf(submitted)
  @IsBoolean()
  public readonly allowBillingSpecialistApproval?: boolean;

  @ValidateIf(submitted)
  @IsBoolean()
  public readonly requireReasonForManualChange?: boolean;

  @ValidateIf(submitted)
  @IsBoolean()
  public readonly aiEnabled?: boolean;

  @ValidateIf(submitted)
  @IsBoolean()
  public readonly axenitaExportEnabled?: boolean;

  /**
   * The one nullable field, and the one that is not a boolean.
   *
   * `null` is ACCEPTED and persisted as SQL `NULL`; the column is `varchar(100) NULL`. The empty
   * string stays legal — there is no `@IsNotEmpty` and no `@MinLength` here, and none may be
   * added without an accepted authority, because no canonical document forbids `''`. There is no
   * enum and no pattern either: the accepted `UPDATE` surface names a `varchar` column, not a
   * closed vocabulary, and inventing one here would refuse values the database accepts.
   */
  @ValidateIf(submittedAndNotNull)
  @IsString()
  @MaxLength(RETENTION_POLICY_CODE_MAX_LENGTH)
  public readonly retentionPolicyCode?: string | null;
}
