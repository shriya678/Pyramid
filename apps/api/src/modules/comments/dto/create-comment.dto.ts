import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  /**
   * If set, the new comment is a reply. The parent must be a top-level comment
   * on the same task (validated in the service — replies-of-replies are not
   * allowed, matches the "one level" plan).
   */
  @IsOptional()
  @IsString()
  parentCommentId?: string;
}
