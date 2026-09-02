/**
 * The request schema of `POST /api/v1/patient-references` — four members, and no fifth.
 *
 * Normative sources: `03` §8 (the `422` document and `UNKNOWN_FIELD`), §9, §11 (the request shape
 * and the `P5-I4` clarifications); `02` §11 (`birth_year smallint` nullable, `sex_code
 * varchar(20)` nullable, `patient_references_birth_year_check`); D-062 part D (generic, static,
 * non-reflecting messages); D-072 `OD-P5-I4-9`; D-079 `OD-P5-I4C-4` and `OD-P5-I4C-5`;
 * `08` §12.12 obligations 10 and 11.
 *
 * TWO MEMBERS ARE REQUIRED AND TWO ARE NULLABLE, EXACTLY AS `03` HAS THEM
 *
 *     sourceSystem              required, and `MANUAL` is the only accepted value
 *     externalPatientReference  required; normalised by the MANUAL-v1 profile afterwards
 *     birthYear                 `number | null`, and omitting it is legal
 *     sexCode                   `string | null`, and omitting it is legal
 *
 * THE NULLABLE SEMANTICS ARE PRESERVED AND NOT SILENTLY TIGHTENED (`OD-P5-I4C-4`,
 * `OD-P5-I4C-5`). `@IsOptional()` skips validation for `undefined` AND for `null`, so an omitted
 * field and an explicit `null` both remain legal and both reach the statement as SQL `NULL`.
 * Neither field is made mandatory here, and no server default is introduced — a default would
 * also change what `request_sha256` is taken over, which `03` §4.1 forbids.
 *
 * UNKNOWN FIELDS ARE REJECTED, NOT STRIPPED, AND THE REJECTION PRECEDES HASHING
 *
 * The shared `API_VALIDATION_PIPE_OPTIONS` carries `whitelist` + `forbidNonWhitelisted`, so an
 * unmodelled member is a `422 VALIDATION_ERROR` carrying the stable field code `UNKNOWN_FIELD`
 * rather than a silent drop. The route validates BEFORE it hashes, so a body that would have been
 * whitelisted down to a different document never reaches `request_sha256` at all (`03` §4.2,
 * `04` §7.5a.3).
 *
 * NO MESSAGE HERE CITES A SUBMITTED VALUE. The shared pipe options set
 * `validationError.value = false`, so no rejected value is attached to any error, and every
 * constraint message below is either the framework's own static wording or names the ACCEPTED
 * vocabulary — never what the caller sent (D-062 part D).
 *
 * THE DTO IS NOT THE PRESENCE ORACLE AND IS NOT HASHED. It is used to answer "is every submitted
 * value acceptable?" and for nothing else; the digest is taken over the ORIGINAL PARSED BODY, and
 * the statement reads its values from that same original body. A `class-transformer` instance can
 * materialise an omitted property as an own property holding `undefined`, so reading the instance
 * would invent members the caller never sent — the identical reasoning the settings write path
 * already records.
 */

import { IsDefined, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * The ONLY `source_system` value `P5-I4` accepts (`OD-P5-I4-9`).
 *
 * `AXENITA`, `CSV`, `FHIR` and `OTHER` are syntactically valid `integration_provider` enum
 * members and are nevertheless refused with `422 VALIDATION_ERROR`: their normalisation profiles
 * do not exist, and `03` §11 forbids inventing one. THE DATABASE ENUM IS NOT CHANGED — the
 * narrowing is an application decision, and a schema change is neither required nor authorised.
 */
export const ACCEPTED_SOURCE_SYSTEMS = ['MANUAL'] as const;

/**
 * The closed non-null `sexCode` vocabulary of `P5-I4C` v1 (`OD-P5-I4C-4`).
 *
 * `F` and `M`, and nothing else. `O` and `U` are NOT accepted, this is NOT FHIR
 * `AdministrativeGender`, and no encounter-specific sex semantics is implied. `02` defines
 * `sex_code` as a plain nullable `varchar(20)` with NO enum and NO check constraint, so closing
 * the vocabulary is purely an application decision and no database artefact changes. Widening it
 * later requires its own owner decision and may not happen silently.
 */
export const ACCEPTED_SEX_CODES = ['F', 'M'] as const;

/** Inclusive lower bound of `birthYear` (`OD-P5-I4C-5`). */
export const MIN_BIRTH_YEAR = 1900;

/** Inclusive upper bound of `birthYear` (`OD-P5-I4C-5`). */
export const MAX_BIRTH_YEAR = 2200;

export class CreatePatientReferenceDto {
  /**
   * `MANUAL`, and only `MANUAL`.
   *
   * `@IsDefined` first, so an omitted member is reported as `REQUIRED` rather than as an enum
   * mismatch — `03` §11 states that an absent `sourceSystem` is `422 VALIDATION_ERROR`, and the
   * field code should say which of the two faults occurred without ever quoting what was sent.
   */
  @IsDefined()
  @IsIn(ACCEPTED_SOURCE_SYSTEMS)
  public readonly sourceSystem!: string;

  /**
   * The external patient identifier, BEFORE normalisation.
   *
   * Only its TYPE is judged here. Emptiness, ill-formed Unicode, `NUL`, C0/C1 controls, the
   * leading BOM, outer whitespace, `NFC` and the 255-UTF-8-byte ceiling are the MANUAL-v1
   * profile's rules and are applied by the accepted normaliser (D-070, `02` §2.8.5) — restating
   * any of them here would create a second, drifting dialect of "valid identifier".
   *
   * IT IS NEVER PERSISTED IN PLAINTEXT, never returned, never logged and never audited. It
   * exists on this type for exactly as long as it takes to derive the keyed lookup token.
   */
  @IsDefined()
  @IsString()
  public readonly externalPatientReference!: string;

  /**
   * `number | null` (`03` §11), an integer within `1900 .. 2200` inclusive when present.
   *
   * APPLICATION FIRST, DATABASE LAST. `patient_references_birth_year_check` enforces the same
   * range and is deliberately kept as the LAST line of defence: this check is the first, so an
   * out-of-range year costs ZERO round trips over `patient_references` and SQLSTATE `23514`
   * never serves as ordinary validation (`OD-P5-I4C-5`).
   *
   * `@IsInt` and not `@IsNumber`: `1968.5` is not a year, and the shared pipe disables implicit
   * conversion, so the string `"1968"` is refused rather than coerced.
   */
  @IsOptional()
  @IsInt()
  @Min(MIN_BIRTH_YEAR)
  @Max(MAX_BIRTH_YEAR)
  public readonly birthYear?: number | null;

  /** `string | null` (`03` §11), one of {@link ACCEPTED_SEX_CODES} when present. */
  @IsOptional()
  @IsIn(ACCEPTED_SEX_CODES)
  public readonly sexCode?: string | null;
}
