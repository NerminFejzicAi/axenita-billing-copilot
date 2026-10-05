/**
 * The request schema of `POST /api/v1/encounters/{encounterId}/cancel` — one member, and no
 * second.
 *
 * Normative sources: `03` §8, §12 (the D-089 frozen contract); D-062 part F.3; D-089 `RULING B`
 * (L4-A: `reason` is REQUIRED), `RULING E` (the closed body) and `RULING G` (the sanitizer).
 *
 *     reason    present, non-null JSON string    absent / null / non-string -> 422
 *
 * EVERY OTHER MEMBER IS REFUSED AS `UNKNOWN_FIELD` by the shared `forbidNonWhitelisted` options.
 *
 * TYPE AND PRESENCE ONLY, ON PURPOSE. Nothing here trims, transforms, normalises or applies the
 * `P5-I5B` / `P5-I5C` reject-hygiene: `reason` follows `ACCEPT_AND_SANITIZE` (L4-C), and every
 * length rule is a UTF-8 BYTE rule over the parsed and the sanitised string, which only the
 * canonical sanitizer (`encounter-cancel-reason.ts`) applies. A code-unit `MaxLength` here would
 * be a second, different length contract.
 *
 * THE DTO IS NOT THE DATA SOURCE — the rule both earlier write paths record. The value that is
 * sanitised is re-read from the raw parsed body (`encounter-cancel-command.ts`).
 */

import { IsDefined, IsString } from 'class-validator';

export class CancelEncounterDto {
  @IsDefined()
  @IsString()
  public readonly reason!: string;
}
