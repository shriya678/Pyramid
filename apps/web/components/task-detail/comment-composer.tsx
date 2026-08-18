'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProseMirrorDoc } from '@/lib/prosemirror-doc';
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
   * Reserved for the phase-7 TipTap Mention extension. Currently unused —
   * kept in the API so callers don't need to change again when mention
   * autocomplete lands. Users can still type `@username` manually; the
   * backend parses and delivers.
   */
  workspaceSlug?: string;
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
  workspaceSlug: _workspaceSlug,
}: CommentComposerProps) {
  const handleRef = useRef<RichTextEditorHandle | null>(null);
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
