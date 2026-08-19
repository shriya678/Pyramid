'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProseMirrorDoc } from '@/lib/prosemirror-doc';
import { uploadInlineImage } from '@/lib/api/resources';
import { RichTextEditor, type RichTextEditorHandle } from '@/components/rich-text/rich-text-editor';

export interface CommentComposerProps {
  onSubmit: (doc: ProseMirrorDoc) => void;
  isSubmitting?: boolean;
  /** "Comment" for top-level, "Reply" for a reply composer. */
  submitLabel?: string;
  placeholder?: string;
  /** Called on Escape or the Cancel button (reply composers hide themselves;
   *  top-level composer treats it as a no-op). */
  onCancel?: () => void;
  autoFocus?: boolean;
  /** Pre-populate the editor. Used by the edit flow — the composer is
   *  intentionally uncontrolled from the outside after mount, so parents
   *  should key it on comment id to reset state when switching targets. */
  initialDoc?: ProseMirrorDoc | null;
  /**
   * Enables the @-typeahead mention picker (via TipTap Mention extension).
   * When set, typing `@` opens a filtered dropdown of workspace members;
   * picking one inserts a `type: 'mention'` node the backend delivers
   * notifications for. Without this, the editor still lets users type
   * `@username` manually as plain text (backend regex still catches it
   * as an interim, but no autocomplete UX).
   */
  workspaceSlug?: string;
  /**
   * Enables inline image paste / drop / toolbar picker. Required together
   * with workspaceSlug — the upload flow signs a per-task upload URL, so
   * we need both to be in scope. Without taskId, the image affordances
   * are hidden and paste of an image blob does nothing.
   */
  taskId?: string;
}

/**
 * Rich text comment composer. Wraps RichTextEditor with the submit /
 * cancel affordances the CommentsPanel expects. Cmd/Ctrl+Enter submits,
 * Escape cancels — both surfaced from the editor via callbacks.
 *
 * Empty-guard: the editor's `isEmpty()` gates the Submit button so a
 * user can't post a blank comment even though the editor accepts empty
 * paragraphs. Backend also rejects empty docs (validateDoc), belt and
 * suspenders.
 */
export function CommentComposer({
  onSubmit,
  isSubmitting = false,
  submitLabel = 'Comment',
  placeholder = 'Write a comment…',
  onCancel,
  autoFocus,
  initialDoc,
  workspaceSlug,
  taskId,
}: CommentComposerProps) {
  const handleRef = useRef<RichTextEditorHandle | null>(null);

  /**
   * Cloudinary sign+upload wrapper. Enabled only when both workspaceSlug
   * and taskId are set (sign endpoint is task-scoped). RichTextEditor
   * calls this from its paste + drop hooks; the toolbar's image button
   * calls it via a file-picker.
   */
  const uploadImage = useCallback(
    async (file: File | Blob): Promise<{ url: string; width?: number }> => {
      if (!workspaceSlug || !taskId) {
        throw new Error('workspaceSlug + taskId required for inline image upload');
      }
      const res = await uploadInlineImage(workspaceSlug, taskId, file);
      return { url: res.url, width: res.width };
    },
    [workspaceSlug, taskId],
  );
  // Tracks whether the editor currently has any typed content — drives
  // the Submit button disabled state without forcing a re-render on
  // every keystroke via a full doc-in-state pattern.
  const [hasContent, setHasContent] = useState(() => !!initialDoc);

  const submit = () => {
    const handle = handleRef.current;
    if (!handle || handle.isEmpty()) return;
    const doc = handle.getDoc();
    onSubmit(doc);
    handle.clear();
    setHasContent(false);
  };

  const cancel = () => {
    handleRef.current?.clear();
    setHasContent(false);
    onCancel?.();
  };

  return (
    <div className="space-y-2">
      <RichTextEditor
        handleRef={handleRef}
        initialDoc={initialDoc ?? null}
        placeholder={placeholder}
        autoFocus={autoFocus}
        showToolbar
        workspaceSlug={workspaceSlug}
        onImageUpload={workspaceSlug && taskId ? uploadImage : undefined}
        className={cn(
          'overflow-hidden rounded-md border bg-transparent text-sm',
          'focus-within:ring-2 focus-within:ring-ring',
        )}
        onChange={(doc) => {
          // Cheap emptiness check — the doc is a small object per keystroke,
          // and we only care about the boolean transition. useRef would
          // avoid the re-render but then the Submit button wouldn't
          // enable/disable in response.
          const empty = handleRef.current?.isEmpty() ?? true;
          if (empty === hasContent) setHasContent(!empty);
          // Silence the unused-doc warning; the value is read via
          // handleRef.getDoc() at submit time.
          void doc;
        }}
        onSubmit={submit}
        onEscape={cancel}
      />
      <div className="flex items-center justify-end gap-2">
        <p className="mr-auto text-[10px] text-muted-foreground">
          Cmd/Ctrl+Enter to submit, Esc to cancel · type <span className="font-mono">@name</span> to
          mention
        </p>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={isSubmitting}>
            Cancel
          </Button>
        ) : null}
        <Button type="button" size="sm" onClick={submit} disabled={isSubmitting || !hasContent}>
          {isSubmitting ? 'Sending…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
