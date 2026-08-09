import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Only `name` is mutable via API. Slug is immutable to keep shared URLs stable;
 * ownership + membership have their own endpoints (or aren't supported yet).
 */
export class UpdateWorkspaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}
