import { Priority } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
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
 * All fields optional. Semantics:
 *   - undefined (omitted) → no change
 *   - null on projectId / startDate / dueDate → clear the field
 *   - array on assigneeIds / labelIds → replaces the whole set (declarative)
 */
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsString()
  statusId?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  projectId?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  labelIds?: string[];

  @IsOptional()
  @IsNumber()
  orderInColumn?: number;
}
