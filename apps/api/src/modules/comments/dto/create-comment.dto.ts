import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Body is now a ProseMirror JSON document (TipTap output shape). Full
 * structural validation happens in the service — here we just gate that
 * it's an object at all; class-validator can't cheaply express the whole
 * ProseMirror grammar and doing so would duplicate what the editor
 * already guarantees on the client.
 */
export class CreateCommentDto {
  @IsObject()
  body!: Record<string, unknown>;

  /**
   * If set, the new comment is a reply. The parent must be a top-level comment
   * on the same task (validated in the service — replies-of-replies are not
   * allowed, matches the "one level" plan).
   */
  @IsOptional()
  @IsString()
  parentCommentId?: string;
}
