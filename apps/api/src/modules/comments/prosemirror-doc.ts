import { BadRequestException } from '@nestjs/common';

/**
 * Minimal ProseMirror doc shape. TipTap produces this from the rich text
 * editor; we accept it as the storage format for comment bodies.
 *
 * Deliberately loose typing (`Record<string, unknown>`) — we validate
 * enough at the boundary to keep the DB clean and let the frontend
 * enforce the full grammar via TipTap's schema. Doing full validation
 * server-side would mirror ~1000 lines of TipTap schema code with no
 * meaningful additional safety.
 */
/**
 * Index signature (`[key: string]: unknown`) is required so this type
 * satisfies Prisma's `InputJsonObject` constraint when we pass a doc
 * to `.create({ data: { body: doc } })`. Without it, Prisma refuses
 * the doc even though it's structurally JSON-serializable.
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
 * Max serialized size of a doc, in bytes. Legacy plain-text bodies were
 * capped at 5000 chars; with JSON overhead (typically 5-10x plain text
 * once TipTap wraps everything in nodes + marks) 50KB gives users a
 * generous ceiling while stopping pathological payloads.
 *
 * Doesn't count embedded image data — images are Cloudinary URLs (a
 * short string), so a comment with 10 images is still small JSON.
 */
const MAX_DOC_BYTES = 50_000;

/**
 * Validate a client-submitted body and return it as a ProseMirrorDoc.
 * Throws BadRequestException with a client-safe message on failure.
 *
 * Checks:
 *   1. Root is `{ type: 'doc', content: array }` — the only shape TipTap
 *      ever emits.
 *   2. Serialized size ≤ MAX_DOC_BYTES.
 *   3. Doc has at least one non-empty node so we don't accept empty
 *      submissions (matches the old @MinLength(1) on the plain-text
 *      DTO).
 */
export function validateDoc(body: unknown): ProseMirrorDoc {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('body must be a ProseMirror doc object');
  }
  const doc = body as Record<string, unknown>;
  if (doc.type !== 'doc') {
    throw new BadRequestException('body must be a doc node (type: "doc")');
  }
  if (doc.content !== undefined && !Array.isArray(doc.content)) {
    throw new BadRequestException('body.content must be an array of nodes');
  }
  const size = JSON.stringify(doc).length;
  if (size > MAX_DOC_BYTES) {
    throw new BadRequestException(`body exceeds max size (${size} bytes > ${MAX_DOC_BYTES} bytes)`);
  }
  const plain = extractPlainText(doc as unknown as ProseMirrorDoc).trim();
  if (plain.length === 0) {
    // Also allow if the doc has non-text content (images, files, etc.).
    // Recursively check for any node type that carries meaning without text.
    if (!hasNonTextContent(doc as unknown as ProseMirrorDoc)) {
      throw new BadRequestException('body cannot be empty');
    }
  }
  return doc as unknown as ProseMirrorDoc;
}

/**
 * Walk a ProseMirror doc and concatenate all text-node text into a single
 * string. Nodes are joined with spaces so tokens from different paragraphs
 * don't accidentally fuse (matters for mention detection: `@alice` at the
 * end of one paragraph and `bob` at the start of the next shouldn't parse
 * as `@alicebob`).
 *
 * Used by:
 *   - Notification MENTION emission (regex the resulting string for @tokens
 *     against workspace-member usernames) — will be replaced by structural
 *     mention-node detection when the TipTap Mention extension ships.
 *   - Notification list previews (a short excerpt of the mentioning comment
 *     so the bell popover can read "Priya mentioned you: hey take a look").
 */
export function extractPlainText(doc: ProseMirrorDoc | ProseMirrorNode): string {
  const parts: string[] = [];
  const walk = (node: ProseMirrorNode | ProseMirrorDoc) => {
    if ('text' in node && typeof node.text === 'string') {
      parts.push(node.text);
    }
    if ('content' in node && Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
    }
  };
  walk(doc);
  return parts.join(' ');
}

/**
 * Truncate an extracted plain-text preview to `max` chars with an ellipsis.
 * Used by notification previews so a 5000-char rich comment doesn't spill
 * the whole bell popover.
 */
export function docPreview(doc: ProseMirrorDoc, max = 140): string {
  const text = extractPlainText(doc).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

/**
 * Returns true if the doc contains any node that isn't just text or a
 * container — e.g. image, hardBreak, horizontalRule, or a custom node.
 * Lets us accept an "empty" body that still carries meaning (a comment
 * that's just an image, for instance).
 */
function hasNonTextContent(doc: ProseMirrorDoc): boolean {
  const containerTypes = new Set([
    'doc',
    'paragraph',
    'text',
    'heading',
    'bulletList',
    'orderedList',
    'listItem',
    'blockquote',
    'codeBlock',
  ]);
  let found = false;
  const walk = (node: ProseMirrorNode | ProseMirrorDoc) => {
    if (found) return;
    if (!containerTypes.has(node.type)) {
      found = true;
      return;
    }
    if ('content' in node && Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
    }
  };
  walk(doc);
  return found;
}
