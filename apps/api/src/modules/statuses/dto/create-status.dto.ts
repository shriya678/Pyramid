import { IsNumber, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateStatusDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  /** Hex color e.g. #3b82f6. Enforced by regex — no CSS keywords or rgb() etc. */
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a 6-digit hex like #3b82f6' })
  color!: string;

  /**
   * Column position. Float, so drag-drop reorder can insert between two
   * siblings without rewriting everyone: pick (leftOrder + rightOrder) / 2.
   * Optional on create — service will append (max + 1000) if omitted.
   */
  @IsOptional()
  @IsNumber()
  order?: number;
}
