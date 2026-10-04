/**
 * The request schema of `POST /api/v1/encounters` — eleven members, and no twelfth.
 *
 * Normative sources: `03` §8 (the `422` document and `UNKNOWN_FIELD`), §12 (the D-085 current
 * contract and its corrective addendum); `02` §7 (`encounters`, `encounter_diagnoses` column
 * limits); D-062 part D and part H.3; D-085 `OD-D085-1` … `OD-D085-6`, `OD-D085-16`.
 *
 *     required, non-null   patientReferenceId, occurredAt, treatmentDate, sourceSystem, diagnoses
 *     optional, nullable   responsiblePhysicianId, guarantorType, insuranceContext, specialtyCode,
 *                          patientAgeAtEncounter, patientSexAtEncounter
 *
 * `@IsOptional()` skips validation for `undefined` AND for `null`, so an omitted optional member
 * and an explicit `null` are both legal — and both stay DIFFERENT representations in the hashed
 * original body, because nothing here normalises one into the other (`OD-D085-1`, `OD-D085-7`).
 *
 * THE DTO IS NOT THE PRESENCE ORACLE AND IS NOT HASHED — the same rule the patient-reference write
 * path records. It answers "is every submitted value acceptable?" and nothing else; the values are
 * read from the original parsed body afterwards.
 *
 * NO MESSAGE CITES A SUBMITTED VALUE. The shared pipe options set `validationError.value = false`,
 * and every custom message below is a static description of the RULE (D-062 part D).
 */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MinLength,
  Min,
  ValidateBy,
  ValidateNested,
  type ValidationOptions,
} from 'class-validator';

import { isWellFormedUnicode } from '../../crypto/manual-v1-identifier-normalizer.js';
import { isUuid } from '../../identity/application/practice-context.js';

/**
 * The ONLY `sourceSystem` value `P5-I5B` accepts (`OD-D085-2`).
 *
 * `AXENITA`, `CSV`, `FHIR` and `OTHER` are valid `integration_provider` members and are
 * nevertheless refused with `422`. `D-OPEN-009` is neither closed nor changed by this.
 */
export const ACCEPTED_ENCOUNTER_SOURCE_SYSTEMS = ['MANUAL'] as const;

/** `diagnoses` cardinality ceiling — `0..50` (`OD-D085-3`). */
export const MAX_ENCOUNTER_DIAGNOSES = 50;

/** Inclusive bounds of `patientAgeAtEncounter` (`OD-D085-6`; `encounters_patient_age_check`). */
export const MIN_PATIENT_AGE_AT_ENCOUNTER = 0;
export const MAX_PATIENT_AGE_AT_ENCOUNTER = 130;

/**
 * The column limits of `02` §7, in CHARACTERS — which is what `varchar(n)` counts in PostgreSQL.
 *
 * Measured in Unicode code points below rather than UTF-16 code units, so the application limit
 * and the column limit are the same number for every input (`OD-D085-4`: existing length limits
 * remain authoritative, neither widened nor narrowed).
 */
export const ENCOUNTER_STRING_MAX_LENGTH = Object.freeze({
  guarantorType: 30,
  insuranceContext: 30,
  specialtyCode: 50,
  patientSexAtEncounter: 20,
  codingSystem: 30,
  code: 50,
});

/**
 * Outer Unicode `White_Space` — the binary property, the same definition the MANUAL-v1 profile
 * uses. Here it is REFUSED rather than trimmed: `OD-D085-4` forbids a silent trim.
 */
const OUTER_WHITE_SPACE = /^\p{White_Space}|\p{White_Space}$/u;

/**
 * Whether `value` contains `NUL` or a character of the ratified C0/C1 set.
 *
 * `U+0000`-`U+001F` (NUL, TAB, LF and CR included) and `U+0080`-`U+009F`, the same set the
 * MANUAL-v1 profile ratified. `U+007F` is deliberately not in it, for the same reason.
 */
function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);

    if (unit <= 0x1f || (unit >= 0x80 && unit <= 0x9f)) {
      return true;
    }
  }

  return false;
}

/** The number of Unicode code points — the unit `varchar(n)` limits. */
function codePointLength(value: string): number {
  let length = 0;

  for (const _codePoint of value) {
    length += 1;
  }

  return length;
}

/**
 * The `P5-I5B` string hygiene of `OD-D085-4` — valid Unicode, no NUL, no C0/C1 control, no
 * leading or trailing white space, no transformation of any kind.
 *
 * A NON-string passes this check on purpose: `@IsString` owns that fault, and reporting it twice
 * would add nothing. Emptiness is `@MinLength(1)`'s fault for the same reason (`OD-D085-16`).
 * Specific to `P5-I5B`; this is not a global cross-module policy.
 */
export function isHygienicEncounterString(value: unknown): boolean {
  if (typeof value !== 'string') {
    return true;
  }

  return (
    isWellFormedUnicode(value) && !containsControlCharacter(value) && !OUTER_WHITE_SPACE.test(value)
  );
}

function IsHygienicEncounterString(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isHygienicEncounterString',
      validator: {
        validate: (value: unknown): boolean => isHygienicEncounterString(value),
        defaultMessage: (): string =>
          'must not contain control characters or leading or trailing white space',
      },
    },
    options,
  );
}

function MaxCodePoints(maximum: number, options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      // `maxLength` on purpose: it IS a maximum-length rule, so it reports the existing stable
      // `INVALID_LENGTH` field code rather than a new one.
      name: 'maxLength',
      constraints: [maximum],
      validator: {
        validate: (value: unknown): boolean =>
          typeof value !== 'string' || codePointLength(value) <= maximum,
        defaultMessage: (): string => `must be at most ${String(maximum)} characters long`,
      },
    },
    options,
  );
}

/** The ACCEPTED repository UUID shape, reused unchanged (`practice-context.ts`, D-073). */
function IsRepositoryUuid(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      // `isUuid` on purpose: it IS a UUID rule, so it reports the existing `INVALID_UUID` code.
      name: 'isUuid',
      validator: {
        validate: (value: unknown): boolean => typeof value === 'string' && isUuid(value),
        defaultMessage: (): string => 'must be a UUID',
      },
    },
    options,
  );
}

/** `YYYY-MM-DD`, nothing more and nothing less. */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * RFC 3339 `date-time` with an EXPLICIT zone — `Z` or a numeric offset (`OD-D085-5`).
 *
 * `T` and `Z` are upper case only, which RFC 3339 §5.6 permits a specification to require. A
 * date-time without a zone does not match and is therefore refused.
 */
const RFC3339_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/** The earliest and latest instant the public `.sssZ` wire format can render as 24 characters. */
const EARLIEST_RENDERABLE_INSTANT = toUtcMilliseconds(1);
const LATEST_RENDERABLE_INSTANT = toUtcMilliseconds(10000) - 1;

/** `Date.UTC` for a full four-digit year, without its `0..99 -> 1900..1999` remapping. */
function toUtcMilliseconds(
  year: number,
  month = 1,
  day = 1,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  const instant = new Date(0);

  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, second, 0);

  return instant.getTime();
}

/** Whether `year-month-day` names a real Gregorian calendar day in years `0001..9999`. */
function isCalendarDay(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return day <= (daysInMonth[month - 1] ?? 0);
}

/** Whether `value` is a strict, real `YYYY-MM-DD` calendar date. */
export function isStrictCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const match = CALENDAR_DATE.exec(value);

  return match !== null && isCalendarDay(Number(match[1]), Number(match[2]), Number(match[3]));
}

/**
 * Whether `value` is an RFC 3339 date-time with an explicit zone that names a real instant the
 * public wire format can render.
 *
 * Every field is range-checked rather than handed to `Date.parse`, whose leniency is
 * implementation-defined. Second `60` is refused: an ECMAScript `Date` cannot represent a leap
 * second, so accepting one would require a silent transformation, which `OD-D085-4` forbids.
 * An instant whose UTC rendering would leave the four-digit year range is refused for the same
 * reason — the response format of `OD-D085-5` could not represent it.
 */
export function isRfc3339DateTimeWithZone(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const match = RFC3339_DATE_TIME.exec(value);

  if (match === null) {
    return false;
  }

  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  if (!isCalendarDay(year, month, day) || hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  let offsetMinutes = 0;

  if (match[7] !== undefined) {
    const offsetHour = Number(match[8]);
    const offsetMinute = Number(match[9]);

    if (offsetHour > 23 || offsetMinute > 59) {
      return false;
    }

    offsetMinutes = (match[7] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  }

  const instant = toUtcMilliseconds(year, month, day, hour, minute, second) - offsetMinutes * 60000;

  return instant >= EARLIEST_RENDERABLE_INSTANT && instant <= LATEST_RENDERABLE_INSTANT;
}

function IsStrictCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStrictCalendarDate',
      validator: {
        validate: (value: unknown): boolean => isStrictCalendarDate(value),
        defaultMessage: (): string => 'must be a valid calendar date in the form YYYY-MM-DD',
      },
    },
    options,
  );
}

function IsRfc3339DateTimeWithZone(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isRfc3339DateTimeWithZone',
      validator: {
        validate: (value: unknown): boolean => isRfc3339DateTimeWithZone(value),
        defaultMessage: (): string =>
          'must be an RFC 3339 date-time with an explicit time zone offset',
      },
    },
    options,
  );
}

/**
 * One diagnosis — exactly `codingSystem`, `code` and `isPrimary`, all three required and non-null.
 *
 * `description` and `diagnosisType` are NOT members, so the shared pipe refuses them as
 * `UNKNOWN_FIELD` (`OD-D085-3`). Both stay free-form in v1 with no vocabulary (D-062 part H.3).
 */
export class CreateEncounterDiagnosisDto {
  @IsDefined()
  @IsString()
  @MinLength(1)
  @IsHygienicEncounterString()
  @MaxCodePoints(ENCOUNTER_STRING_MAX_LENGTH.codingSystem)
  public readonly codingSystem!: string;

  @IsDefined()
  @IsString()
  @MinLength(1)
  @IsHygienicEncounterString()
  @MaxCodePoints(ENCOUNTER_STRING_MAX_LENGTH.code)
  public readonly code!: string;

  @IsDefined()
  @IsBoolean()
  public readonly isPrimary!: boolean;
}

export class CreateEncounterDto {
  /** Same-practice existence is decided by `encounters_patient_reference_fk`, never pre-read. */
  @IsDefined()
  @IsString()
  @MinLength(1)
  @IsRepositoryUuid()
  public readonly patientReferenceId!: string;

  @IsDefined()
  @IsString()
  @MinLength(1)
  @IsRfc3339DateTimeWithZone()
  public readonly occurredAt!: string;

  @IsDefined()
  @IsString()
  @MinLength(1)
  @IsStrictCalendarDate()
  public readonly treatmentDate!: string;

  /** Same-practice membership is decided by `encounters_responsible_physician_membership_fk`. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @IsRepositoryUuid()
  public readonly responsiblePhysicianId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @IsHygienicEncounterString()
  @MaxCodePoints(ENCOUNTER_STRING_MAX_LENGTH.guarantorType)
  public readonly guarantorType?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @IsHygienicEncounterString()
  @MaxCodePoints(ENCOUNTER_STRING_MAX_LENGTH.insuranceContext)
  public readonly insuranceContext?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @IsHygienicEncounterString()
  @MaxCodePoints(ENCOUNTER_STRING_MAX_LENGTH.specialtyCode)
  public readonly specialtyCode?: string | null;

  /** `@IsInt`, and the shared pipe disables implicit conversion, so `"58"` is refused. */
  @IsOptional()
  @IsInt()
  @Min(MIN_PATIENT_AGE_AT_ENCOUNTER)
  @Max(MAX_PATIENT_AGE_AT_ENCOUNTER)
  public readonly patientAgeAtEncounter?: number | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @IsHygienicEncounterString()
  @MaxCodePoints(ENCOUNTER_STRING_MAX_LENGTH.patientSexAtEncounter)
  public readonly patientSexAtEncounter?: string | null;

  @IsDefined()
  @IsIn(ACCEPTED_ENCOUNTER_SOURCE_SYSTEMS)
  public readonly sourceSystem!: string;

  /**
   * `0..50` diagnoses. Every element must be a plain object (`@IsObject({ each: true })` refuses
   * `null`, primitives and nested arrays), and each object is validated with the SAME
   * whitelist + `forbidNonWhitelisted` options as the root. The cross-element rules — at most
   * one primary, no duplicate `(codingSystem, code)` — run after this schema has passed.
   */
  @IsDefined()
  @IsArray()
  @ArrayMaxSize(MAX_ENCOUNTER_DIAGNOSES)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CreateEncounterDiagnosisDto)
  public readonly diagnoses!: CreateEncounterDiagnosisDto[];
}
