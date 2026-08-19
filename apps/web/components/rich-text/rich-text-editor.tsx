'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { useEffect, useImperativeHandle } from 'react';
import { cn } from '@/lib/utils';
import type { ProseMirrorDoc } from '@/lib/prosemirror-doc';
import { richTextExtensions } from './rich-text-extensions';
import { RichTextToolbar } from './rich-text-toolbar';
import { useMentionSuggestion } from './use-mention-suggestion';

export interface RichTextEditorHandle {
  /** Programmatically clear the editor (used after a successful submit). */
  clear: () => void;
  /** Focus the underlying contenteditable. */
  focus: () => void;
  /** Get the current doc — the parent usually gets this via onChange. */
  getDoc: () => ProseMirrorDoc;
  /** Get plain-text-flattened content — used to gate submit-when-empty. */
  isEmpty: () => boolean;
}

export interface RichTextEditorProps {
  /** Seed content. Only read once on mount — parents should key on change to reset. */
  initialDoc?: ProseMirrorDoc | null;
  /** Fires on every keystroke with the current doc. */
  onChange?: (doc: ProseMirrorDoc) => void;
  /** Placeholder shown when the editor is empty. */
  placeholder?: string;
  /** Autofocus on mount — used by reply/edit composers. */
  autoFocus?: boolean;
  /** Called on Cmd/Ctrl+Enter — the parent uses this to submit. */
  onSubmit?: () => void;
  /** Called on Escape — the parent uses this to cancel. */
  onEscape?: () => void;
  /** Read-only mode used by the Viewer wrapper; also useful for previews. */
  editable?: boolean;
  /** Imperative handle for parents that need to clear/focus/query. */
  handleRef?: React.Ref<RichTextEditorHandle>;
  /**
   * Render the formatting toolbar above the content. Off by default so the
   * viewer (which shares this component) doesn't get toolbar chrome.
   */
  showToolbar?: boolean;
  /**
   * Enables the @-typeahead mention picker. When set, typing `@` opens a
   * filtered dropdown of workspace members; picking one inserts a
   * `type: 'mention'` node the backend can deliver notifications for.
   */
  workspaceSlug?: string;
  /**
   * Handler for image paste/drop. Receives the image blob, uploads it,
   * returns a URL to embed. Called from the editor's own paste + drop
   * hooks so the composer (which owns workspaceSlug + taskId) can do
   * the actual Cloudinary sign+upload.
   *
   * If undefined, paste/drop of images does nothing extra — bare
   * clipboard behavior applies (usually inserts nothing for image
   * blobs since they aren't valid HTML/text).
   */
  onImageUpload?: (file: File | Blob) => Promise<{ url: string; width?: number }>;
  className?: string;
}

/**
 * TipTap-based rich text editor. Deliberately styleless beyond a minimum —
 * the composer wrapping it owns the border, padding, and toolbar. Kept
 * this way so RichTextViewer can share the same rendering pipeline just
 * by flipping `editable` false + omitting the placeholder.
 *
 * Cmd/Ctrl+Enter and Escape are surfaced as callbacks; the editor
 * intercepts the keydown at capture-time so extensions can't swallow it.
 */
export function RichTextEditor({
  initialDoc,
  onChange,
  placeholder,
  autoFocus,
  onSubmit,
  onEscape,
  editable = true,
  handleRef,
  showToolbar = false,
  workspaceSlug,
  onImageUpload,
  className,
}: RichTextEditorProps) {
  // The suggestion pipeline is only wired when workspaceSlug is provided
  // (composer usage). Viewer/read-only usage passes nothing so no
  // members request fires.
  const mentionSuggestion = useMentionSuggestion(workspaceSlug ?? '');
  const editor = useEditor({
    extensions: richTextExtensions({
      placeholder,
      mentionSuggestion: workspaceSlug ? mentionSuggestion : undefined,
    }),
    content: initialDoc ?? undefined,
    autofocus: autoFocus ? 'end' : false,
    editable,
    immediatelyRender: false, // Prevents SSR/hydration mismatch — TipTap renders on client only.
    editorProps: {
      attributes: {
        class: cn(
          // The core prose styles; the parent adds its own container styles.
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none',
          '[&_p]:my-1 [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1',
          '[&_pre]:my-2 [&_pre]:bg-muted [&_pre]:text-foreground [&_pre]:rounded-md [&_pre]:p-2 [&_pre]:text-xs',
          '[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.9em]',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
        ),
      },
      handleKeyDown: (_view, event) => {
        // Cmd/Ctrl+Enter → submit. Prevents ProseMirror from inserting a
        // hard break first.
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onSubmit?.();
          return true;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onEscape?.();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        // Intercept clipboard images (screenshots, copied images from other
        // apps). Text/HTML paste falls through to ProseMirror's default.
        if (!onImageUpload) return false;
        const files = extractImageFiles(event.clipboardData);
        if (files.length === 0) return false;
        event.preventDefault();
        void uploadAndInsert(view, files, onImageUpload);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        // moved=true means it's a ProseMirror-internal drag (e.g. moving a
        // node within the doc) — let ProseMirror handle those normally.
        if (moved || !onImageUpload) return false;
        const files = extractImageFiles(event.dataTransfer);
        if (files.length === 0) return false;
        event.preventDefault();
        void uploadAndInsert(view, files, onImageUpload);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getJSON() as ProseMirrorDoc);
    },
  });

  // Sync `editable` prop changes (e.g. Viewer usage). TipTap's editor
  // remembers its editable flag; when the prop flips we push it through.
  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  useImperativeHandle(
    handleRef,
    (): RichTextEditorHandle => ({
      clear: () => editor?.commands.clearContent(true),
      focus: () => editor?.commands.focus('end'),
      getDoc: () => (editor?.getJSON() ?? { type: 'doc', content: [] }) as ProseMirrorDoc,
      isEmpty: () => (editor?.isEmpty ?? true) && !hasNonTextContent(editor),
    }),
    [editor],
  );

  if (!editor) {
    // First render (before TipTap creates the ProseMirror view). Placeholder
    // matches the editor's rendered height so there's no layout shift.
    return (
      <div
        className={cn(
          'min-h-[4.5rem] rounded-md border bg-transparent px-3 py-2 text-sm text-muted-foreground',
          className,
        )}
      >
        {placeholder ?? ' '}
      </div>
    );
  }

  if (showToolbar) {
    // Toolbar wraps with the editor content in a shared container so a
    // rounded border can wrap both — the composer's border lives on the
    // OUTER wrapper it renders around us, so we don't add one here.
    return (
      <div className={className}>
        <RichTextToolbar editor={editor} onImageUpload={onImageUpload} />
        <EditorContent editor={editor} className="px-3 py-2" />
      </div>
    );
  }
  return <EditorContent editor={editor} className={className} />;
}

/**
 * Pull image File objects out of a ClipboardEvent's dataTransfer or a
 * DragEvent's dataTransfer. Filters to items whose MIME type starts with
 * "image/" so a paste with mixed content (image + text) doesn't upload
 * the text.
 */
function extractImageFiles(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const out: File[] = [];
  // dt.files works for drops and (for images) paste from OS.
  for (const f of Array.from(dt.files)) {
    if (f.type.startsWith('image/')) out.push(f);
  }
  // dt.items covers the Chrome/Edge "paste screenshot from clipboard" case
  // where the image arrives as an item, not a file. Skip if we already
  // captured them via .files to avoid double-upload.
  if (out.length === 0) {
    for (const item of Array.from(dt.items ?? [])) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  return out;
}

/**
 * Upload each image and insert an `image` node for it at the current
 * selection. Uploads run in parallel — most pastes are one image, so
 * this doesn't matter in practice, but bulk drag-drop of multiple
 * files feels much better than serial uploads.
 *
 * Failures are logged; a failed image just doesn't insert. Not going
 * to surface a full error toast for a paste — that's more noise than
 * signal for a workflow the user will just retry.
 */
async function uploadAndInsert(
  view: import('@tiptap/pm/view').EditorView,
  files: File[],
  uploader: NonNullable<RichTextEditorProps['onImageUpload']>,
): Promise<void> {
  const results = await Promise.allSettled(files.map((f) => uploader(f)));
  const state = view.state;
  const nodes = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      nodes.push(
        state.schema.nodes.image.create({
          src: result.value.url,
          alt: '',
          width: '100%',
        }),
      );
    } else {
      // Diagnostic for a paste/drop failure — user will retry; we don't
      // surface a full error toast because paste is a low-cost workflow.
      console.error('inline image upload failed', result.reason);
    }
  }
  if (nodes.length === 0) return;
  const tr = state.tr;
  for (const node of nodes) tr.insert(tr.selection.from, node);
  view.dispatch(tr);
}

/**
 * TipTap's `isEmpty` is text-only — an image-only doc still reports empty.
 * Later phases (image, attachment) will make this matter; wired in now so
 * the submit-when-empty guard doesn't accidentally block picture-only
 * comments once those ship.
 */
function hasNonTextContent(editor: Editor | null): boolean {
  if (!editor) return false;
  let found = false;
  editor.state.doc.descendants((node) => {
    if (found) return false;
    if (node.type.name === 'image' || node.type.name === 'attachment') {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}
