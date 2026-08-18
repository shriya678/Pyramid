import { IsObject } from 'class-validator';

/**
 * Only `body` is editable. Parent link is immutable — you can't move a reply
 * to a different thread after posting. Body is a ProseMirror JSON document,
 * structurally validated in the service.
 */
export class UpdateCommentDto {
  @IsObject()
  body!: Record<string, unknown>;
}
