import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Workspace-invite body. Role is restricted to MEMBER or ADMIN — OWNER only
 * exists on the workspace creator, and COLLABORATOR rows are only born from
 * the project-invite endpoint.
 */
export class AddWorkspaceMemberDto {
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsIn(['MEMBER', 'ADMIN'])
  role!: 'MEMBER' | 'ADMIN';
}
