import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import type { Extensions } from '@tiptap/react';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { MentionItem } from './mention-suggestion-list';
import { ResizableImage } from './resizable-image-extension';

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
 *   - Mention: @-typeahead extension. Emits `type: 'mention'` nodes with
 *     `attrs.id` (userId) and `attrs.label` (username). The composer wires
 *     the suggestion pipeline; the viewer just needs the node schema so
 *     mention nodes render correctly on read.
 *
 * The `mentionSuggestion` argument is optional so the viewer can use the
 * same extensions without needing to know about the picker.
 */
export function richTextExtensions(opts?: {
  placeholder?: string;
  mentionSuggestion?: Omit<SuggestionOptions<MentionItem>, 'editor'>;
}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // TipTap 3's StarterKit ships Link by default; disable it so the
      // separately-configured @tiptap/extension-link below wins (with
      // our autolink + target=_blank + underline styling). Leaving both
      // registered logs "Duplicate extension names found: ['link']".
      link: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
        class: 'text-primary underline underline-offset-2 hover:no-underline',
      },
    }),
    Placeholder.configure({
      placeholder: opts?.placeholder ?? 'Write something…',
      showOnlyWhenEditable: true,
      showOnlyCurrent: false,
    }),
    // Mention node schema is always registered — the viewer needs it to
    // render `type: 'mention'` nodes correctly. The suggestion behavior
    // (dropdown, filter, insert) only wires when opts.mentionSuggestion
    // is provided.
    //
    // Only SPREAD the suggestion key when we have one. Passing
    // `suggestion: undefined` explicitly overrides Mention's default
    // config (which sets `char: '@'`) and crashes with "Cannot read
    // properties of undefined (reading 'char')" the moment the extension
    // initializes — the viewer path hit this on every comment read.
    Mention.configure({
      HTMLAttributes: {
        class: 'rounded bg-primary/15 px-1 font-medium text-primary [&]:no-underline',
      },
      // renderText controls how the mention serializes to plain text —
      // extractPlainText uses this shape for notification previews.
      renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
      renderHTML: ({ options, node }) => [
        'span',
        { ...options.HTMLAttributes, 'data-mention-id': node.attrs.id },
        `@${node.attrs.label ?? node.attrs.id}`,
      ],
      ...(opts?.mentionSuggestion ? { suggestion: opts.mentionSuggestion } : {}),
    }),
    // Image node with resize UI (25/50/75/100% width presets). Extends
    // @tiptap/extension-image so the base schema (src/alt/title) is
    // untouched — we just add a width attr + NodeView.
    ResizableImage,
  ];
}
