import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/**
 * Test-only payload used to exercise the global `ValidationPipe` and the Problem Details
 * `errors` mapping.
 *
 * It is a technical fixture with no business meaning and lives outside `src` on purpose,
 * so that phase 1 ships no placeholder domain endpoint (04 §3.4).
 */
export class ValidationProbeDto {
  @IsUUID('4')
  public readonly resourceId!: string;

  @IsString()
  @IsNotEmpty()
  public readonly label!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  public readonly amount?: number;
}
