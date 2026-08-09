import { IsNumber, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * All fields optional — this is the shape PATCH accepts. Reorder via
 * drag-drop hits this same endpoint with just { order: 1500 }.
 */
export class UpdateStatusDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a 6-digit hex like #3b82f6' })
  color?: string;

  @IsOptional()
  @IsNumber()
  order?: number;
}
