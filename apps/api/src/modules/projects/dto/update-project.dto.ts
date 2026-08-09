import { Priority } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * All fields optional. A null-or-empty leadUserId or dueDate is treated as
 * "clear this field" — see @ValidateIf below.
 */
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  /**
   * Pass a workspace-member userId to reassign, or `null` to clear. Undefined
   * (field omitted) means "no change".
   */
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  leadUserId?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsNumber()
  orderIndex?: number;
}
