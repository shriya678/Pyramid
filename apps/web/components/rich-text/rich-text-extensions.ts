import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import type { Extensions } from '@tiptap/react';

/**
 * Extension set shared by RichTextEditor + RichTextViewer so writes and
 * reads speak exactly the same doc grammar. Splitting the config here
 * keeps the two components thin and prevents drift.
 *
 * Currently ships:
 *   - StarterKit: paragraph, heading, bold, italic, strike, code (inline),
 *     bulletList, orderedList, listItem, blockquote, codeBlock, hardBreak,
 *     horizontalRule, history (undo/redo)
 *   - Link: autolink + click-open handling; renders as <a> with underline
 *   - Placeholder: empty-editor hint text (editor only — Viewer ignores it)
 *
 * Later phases add: text color, mention (replaces regex parser), image
 * with resize, file attachment node, slash-command menu.
 */
export function richTextExtensions(placeholder?: string): Extensions {
  return [
    StarterKit.configure({
      // Newlines in the source become hard breaks (Shift+Enter equivalent)
      // rather than paragraph breaks — matches how paste-from-plaintext
      // reads more naturally in a chat/comment context.
      heading: { levels: [1, 2, 3] },
    }),
    Link.configure({
      openOnClick: false, // Viewer will render as clickable; editor stays inert on click.
      autolink: true,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
        class: 'text-primary underline underline-offset-2 hover:no-underline',
      },
    }),
    Placeholder.configure({
      placeholder: placeholder ?? 'Write something…',
      showOnlyWhenEditable: true,
      showOnlyCurrent: false,
    }),
  ];
}
