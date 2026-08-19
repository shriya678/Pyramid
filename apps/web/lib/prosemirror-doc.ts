/**
 * Mirror of the backend `ProseMirrorDoc` shape (see
 * apps/api/src/modules/comments/prosemirror-doc.ts). Comment bodies
 * travel as TipTap-produced JSON docs; every frontend touch of a
 * comment body types against this.
 *
 * Index signatures on both types are required so they satisfy Prisma-
 * shaped `InputJsonObject`-style contracts on the wire.
 */
export interface ProseMirrorDoc {
  type: 'doc';
  content?: ProseMirrorNode[];
  [key: string]: unknown;
}

export interface ProseMirrorNode {
  type: string;
  text?: string;
  content?: ProseMirrorNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
  [key: string]: unknown;
}
