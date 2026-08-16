import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * User-created workspace. Slug is derived server-side from the name; the
 * client never picks one so shared URLs stay predictable.
 */
export class CreateWorkspaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}
