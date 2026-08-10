import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Only `body` is editable. Parent link is immutable — you can't move a reply
 * to a different thread after posting.
 */
export class UpdateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}
