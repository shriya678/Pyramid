/**
 * Mirror of the backend `ProseMirrorDoc` shape (see
 * apps/api/src/modules/comments/prosemirror-doc.ts). Comment bodies now
 * travel as TipTap-produced JSON docs; every touch of a comment body
 * on the frontend types against this.
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

/**
 * Wrap a plain text string in a minimal doc. Used by the current
 * plain-text composer as a transitional shim — every comment submits
 * through this so the backend gets a valid doc, and phase 4's TipTap
 * editor will replace this call site with a real ProseMirror output.
 */
export function docOfPlainText(text: string): ProseMirrorDoc {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  // Preserve line breaks by splitting on \n and emitting one paragraph per
  // line. Empty lines become empty paragraphs — matches how ProseMirror
  // parses a plaintext paste.
  return {
    type: 'doc',
    content: text
      .split('\n')
      .map((line) =>
        line === ''
          ? { type: 'paragraph' }
          : { type: 'paragraph', content: [{ type: 'text', text: line }] },
      ),
  };
}

/**
 * Flatten a doc back to plain text — walks the tree and joins every text
 * node with newlines between paragraphs. Used by the current MentionText
 * renderer until phase 4 ships a real rich-text viewer.
 */
export function docToPlainText(doc: ProseMirrorDoc): string {
  const parts: string[] = [];
  const walkBlock = (node: ProseMirrorNode | ProseMirrorDoc): void => {
    if ('content' in node && Array.isArray(node.content)) {
      const chunks: string[] = [];
      for (const child of node.content) {
        if (child.type === 'text' && typeof child.text === 'string') {
          chunks.push(child.text);
        } else if (Array.isArray(child.content)) {
          walkBlock(child);
        }
      }
      if (chunks.length > 0) parts.push(chunks.join(''));
    }
  };
  walkBlock(doc);
  return parts.join('\n');
}
