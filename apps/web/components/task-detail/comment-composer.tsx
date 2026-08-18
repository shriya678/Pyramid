'use client';

import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWorkspaceMembers } from '@/lib/hooks/use-board-data';
import type { WorkspaceMemberResponse } from '@/lib/api/types';
import { MentionPicker } from './mention-picker';

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
  /**
   * Enables the @mention type-ahead picker. When set, typing `@` after
   * whitespace (or at the start) opens a filtered list of workspace
   * members; arrow-keys navigate, Enter/Tab selects, Escape closes.
   * The picker only fetches members when it's actually open.
   */
  workspaceSlug?: string;
}

/**
 * Plain-text comment composer. Cmd/Ctrl+Enter submits, Escape cancels.
 * Backend rejects empty bodies so we also gate here.
 *
 * When `workspaceSlug` is provided, typing `@` triggers a member picker.
 * Users see teammates' display names alongside their `@username`, so
 * they don't have to guess (fullName "Shriya Gupta" ≠ username
 * "guptashriya"). Selecting an entry inserts the exact `@username`
 * token the backend mention parser matches against — no more silently
 * dropped mentions.
 */
export function CommentComposer({
  onSubmit,
  isSubmitting = false,
  submitLabel = 'Comment',
  placeholder = 'Write a comment…',
  onCancel,
  autoFocus,
  initialBody = '',
  workspaceSlug,
}: CommentComposerProps) {
  const [body, setBody] = useState(initialBody);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Mention picker state. mentionQuery === null means picker closed.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(0);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const membersQuery = useWorkspaceMembers(
    // Only fetch when the picker is potentially in use — avoids an
    // unnecessary members request in edit/reply composers that never
    // trigger mentions.
    workspaceSlug && mentionQuery !== null ? workspaceSlug : '',
  );

  const filtered = useMemo(
    () => filterMembers(membersQuery.data ?? [], mentionQuery ?? ''),
    [membersQuery.data, mentionQuery],
  );

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setBody('');
    setMentionQuery(null);
  };

  /**
   * Look backward from the caret for the last `@` after whitespace/BOF.
   * Returns null if no active mention token — that's the "picker closed"
   * signal.
   */
  const detectMention = (text: string, cursor: number): { query: string; start: number } | null => {
    const before = text.slice(0, cursor);
    const match = /(?:^|\s)@([\w-]{0,40})$/.exec(before);
    if (!match) return null;
    const query = match[1] ?? '';
    // `start` is the position of the `@` itself so we can replace from there.
    return { query, start: cursor - query.length - 1 };
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setBody(next);
    if (!workspaceSlug) return;
    const cursor = e.target.selectionStart;
    const detected = detectMention(next, cursor);
    if (detected) {
      setMentionQuery(detected.query);
      setMentionStart(detected.start);
      setActiveIndex(0);
    } else if (mentionQuery !== null) {
      setMentionQuery(null);
    }
  };

  const insertMention = (username: string) => {
    if (mentionQuery === null) return;
    const cursor = textareaRef.current?.selectionEnd ?? body.length;
    // Replace the `@partial` fragment with `@username ` (trailing space so
    // the user can keep typing without adjusting the caret).
    const newText = body.slice(0, mentionStart) + `@${username} ` + body.slice(cursor);
    const newCursor = mentionStart + username.length + 2; // after `@name `
    setBody(newText);
    setMentionQuery(null);
    // Restore focus + caret in a microtask so the DOM has the new value.
    queueMicrotask(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(newCursor, newCursor);
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Picker keyboard nav takes precedence when it's open.
    if (mentionQuery !== null && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        // Select the highlighted member. Skip if Cmd/Ctrl+Enter — that's
        // still the "submit" gesture.
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
          return;
        }
        e.preventDefault();
        const picked = filtered[activeIndex];
        if (picked) insertMention(picked.user.username);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    // Normal keyboard shortcuts (picker closed or no matches).
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setBody('');
      setMentionQuery(null);
      onCancel?.();
    }
  };

  const pickerOpen = mentionQuery !== null && workspaceSlug !== undefined;

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          value={body}
          onChange={onChange}
          onKeyDown={onKey}
          onBlur={() => {
            // Small timeout so a mousedown-select on the picker registers
            // before the blur closes it. The picker's own onMouseDown also
            // preventDefault's the blur, so this is belt + suspenders.
            setTimeout(() => setMentionQuery(null), 100);
          }}
          placeholder={placeholder}
          rows={3}
          className={cn(
            'w-full rounded-md border bg-transparent px-3 py-2 text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        />
        {pickerOpen ? (
          <MentionPicker
            members={filtered}
            activeIndex={activeIndex}
            onSelect={insertMention}
            onHover={setActiveIndex}
          />
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        <p className="mr-auto text-[10px] text-muted-foreground">
          Cmd/Ctrl+Enter to submit, Esc to cancel
          {workspaceSlug ? <span className="ml-1">· @ to mention</span> : null}
        </p>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setBody('');
              setMentionQuery(null);
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

/**
 * Match against username OR fullName, case-insensitive. Empty query
 * returns every member (capped at 8 for a tidy dropdown).
 *
 * Seeded fake teammates ARE shown in the picker — they're workspace
 * members after all, and the mention *parser* on the backend already
 * skips them for delivery, so it's harmless to mention them from the UI.
 * Consistent with how the Members panel renders them.
 */
function filterMembers(all: WorkspaceMemberResponse[], query: string): WorkspaceMemberResponse[] {
  const q = query.toLowerCase().trim();
  const candidates = q
    ? all.filter(
        (m) =>
          m.user.username.toLowerCase().includes(q) || m.user.fullName.toLowerCase().includes(q),
      )
    : all;
  return candidates.slice(0, 8);
}
