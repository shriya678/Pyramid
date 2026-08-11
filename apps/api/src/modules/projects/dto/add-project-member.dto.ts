import { IsEmail, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Project-invite body. No role field — a project member is a project member,
 * and if they weren't a workspace member yet, they get a COLLABORATOR row
 * created for them implicitly.
 */
export class AddProjectMemberDto {
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;
}
