/**
 * The request schema of `PATCH /api/v1/encounters/{encounterId}` — eight members, and no ninth.
 *
 * Normative sources: `03` §8, §12 (the D-087 current contract); `02` §7 (`encounters` column
 * limits); D-085 `OD-D085-4` … `OD-D085-6`, `OD-D085-10`, `OD-D085-16`; D-087 `OD-P5-I5C-5`.
 *
 *     present, non-null    occurredAt, treatmentDate               absent -> unchanged; null -> 422
 *     present, nullable    responsiblePhysicianId, guarantorType,  absent -> unchanged;
 *                          insuranceContext, specialtyCode,        null   -> SQL NULL
 *                          patientAgeAtEncounter, patientSexAtEncounter
 *
 * EVERY OTHER MEMBER IS REFUSED AS `UNKNOWN_FIELD` by the shared `forbidNonWhitelisted` options —
 * `status`, `patientReferenceId`, `sourceSystem`, `version`, every identifier, every system-managed
 * timestamp, `diagnoses` and every cancel member included. None of them is modelled here, so there
 * is nothing to strip and nothing to forget.
 *
 * THE RULES ARE THE `P5-I5B` RULES, REUSED RATHER THAN RE-STATED. Each decorator below is the
 * create schema's own factory (`create-encounter.dto.ts`), with the same constants, so the two
 * routes cannot drift apart (D-087 `OD-P5-I5C-5`; owner adjudication N-2). The ONLY difference is
 * presence: `@ValidateIf(present)` on the two non-nullable members skips an ABSENT member but
 * still judges an explicit `null`, which every one of their rules refuses.
 *
 * THE DTO IS NOT THE PRESENCE ORACLE — the same rule both earlier write paths record. Which members
 * were submitted is read from the raw parsed body afterwards (`encounter-patch-command.ts`).
 */

import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  ENCOUNTER_STRING_MAX_LENGTH,
  IsHygienicEncounterString,
  IsRepositoryUuid,
  IsRfc3339DateTimeWithZone,
  IsStrictCalendarDate,
  MAX_PATIENT_AGE_AT_ENCOUNTER,
  MaxCodePoints,
  MIN_PATIENT_AGE_AT_ENCOUNTER,
} from './create-encounter.dto.js';

/** Judges every submitted value, `null` included; skips only a member that was not sent. */
function isSubmitted(_dto: object, value: unknown): boolean {
  return value !== undefined;
}

export class PatchEncounterDto {
  @ValidateIf(isSubmitted)
  @IsDefined()
  @IsString()
  @MinLength(1)
  @IsRfc3339DateTimeWithZone()
  public readonly occurredAt?: string;

  @ValidateIf(isSubmitted)
  @IsDefined()
  @IsString()
  @MinLength(1)
  @IsStrictCalendarDate()
  public readonly treatmentDate?: string;

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
}
