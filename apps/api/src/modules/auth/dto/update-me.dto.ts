import { IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Profile fields the current user can self-edit. All optional — the caller
 * PATCHes only what they want to change. Sensitive fields (email, googleId,
 * isGuest, passwordHash) are deliberately omitted; those change through
 * dedicated flows.
 */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  fullName?: string;

  /**
   * Lowercase kebab-ish username. Must be workspace-unique across all users
   * (DB constraint); we surface a friendly 409 if a clash is detected.
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'Username must be lowercase letters, numbers, and dashes (no leading/trailing dash)',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  title?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  avatarUrl?: string | null;
}
