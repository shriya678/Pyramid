import { Priority } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * Query params for GET /workspaces/:slug/tasks.
 *
 * Multi-value fields accept comma-separated strings (e.g. ?priority=HIGH,URGENT)
 * because URL arrays are awkward. Transform decorators split them; validation
 * runs on the array of strings that comes out.
 *
 * `projectId=none` is a sentinel for "tasks with no project".
 */
export class TaskListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsString({ each: true })
  statusIds?: string[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsEnum(Priority, { each: true })
  priority?: Priority[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsString({ each: true })
  labelIds?: string[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsString({ each: true })
  assigneeIds?: string[];

  /** A cuid, or the sentinel `none` for "tasks with no project". */
  @IsOptional()
  @IsString()
  projectId?: string;

  /**
   * Default: only top-level tasks (parentTaskId=null). Pass a task id to
   * fetch that task's subtasks. Pass `any` to bypass the filter entirely.
   */
  @IsOptional()
  @IsString()
  parentTaskId?: string;

  @IsOptional()
  @IsDateString()
  dueBefore?: string;

  @IsOptional()
  @IsDateString()
  dueAfter?: string;
}
