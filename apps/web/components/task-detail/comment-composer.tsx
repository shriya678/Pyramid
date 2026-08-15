'use client';

import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface CommentComposerProps {
  onSubmit: (body: string) => void;
  isSubmitting?: boolean;
  /** "Comment" for top-level, "Reply" for a reply composer. */
  submitLabel?: string;
  placeholder?: string;
  /** Called on Escape or the Cancel button (reply composers hide themselves;
   *  top-level composer treats it as a no-op). */
  onCancel?: () => void;
  autoFocus?: boolean;
  /** Pre-populate the textarea. Used by the edit flow — the composer is
   *  intentionally uncontrolled from the outside after mount, so parents
   *  should key it on comment id to reset state when switching targets. */
  initialBody?: string;
}

/**
 * Plain-text comment composer. Cmd/Ctrl+Enter submits, Escape cancels.
 * Kept intentionally minimal — no rich text; @mentions render via
 * MentionText at read time. The backend rejects empty bodies so we
 * also gate here.
 */
export function CommentComposer({
  onSubmit,
  isSubmitting = false,
  submitLabel = 'Comment',
  placeholder = 'Write a comment…',
  onCancel,
  autoFocus,
  initialBody = '',
}: CommentComposerProps) {
  const [body, setBody] = useState(initialBody);

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setBody('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setBody('');
      onCancel?.();
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        autoFocus={autoFocus}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        rows={3}
        className={cn(
          'w-full rounded-md border bg-transparent px-3 py-2 text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      />
      <div className="flex items-center justify-end gap-2">
        <p className="mr-auto text-[10px] text-muted-foreground">
          Cmd/Ctrl+Enter to submit, Esc to cancel
        </p>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setBody('');
              onCancel();
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="button" size="sm" onClick={submit} disabled={isSubmitting || !body.trim()}>
          {isSubmitting ? 'Sending…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
