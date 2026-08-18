'use client';

import { forwardRef, useEffect, useImperativeHandle, useState, type ForwardedRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { WorkspaceMemberResponse } from '@/lib/api/types';

/**
 * Item shape TipTap's suggestion utility hands us — one per matching
 * workspace member. `id` is the userId (goes into the mention node's
 * attrs.id); `label` is what's inserted as the visible text after the @.
 */
export interface MentionItem {
  id: string;
  label: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface MentionSuggestionListProps {
  items: MentionItem[];
  /** TipTap calls this when the user picks an item (Enter/Tab/click). */
  command: (item: MentionItem) => void;
}

export interface MentionSuggestionListHandle {
  /**
   * TipTap's suggestion plugin forwards keydown events to us so we can
   * intercept navigation keys BEFORE ProseMirror gets them. Return true
   * to swallow, false to let ProseMirror handle normally.
   */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/**
 * The floating dropdown that appears under the caret when the user types
 * `@` in the rich text editor. TipTap's @tiptap/suggestion utility wires
 * position + filter + lifecycle; this component just renders the visual
 * list and handles arrow-key navigation.
 *
 * Empty state shows a friendly message rather than nothing so the user
 * knows the picker is live but nobody matches — vs guessing whether
 * they typed something wrong.
 */
export const MentionSuggestionList = forwardRef(function MentionSuggestionList(
  { items, command }: MentionSuggestionListProps,
  ref: ForwardedRef<MentionSuggestionListHandle>,
) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset the highlight to the top whenever the filtered items change —
  // otherwise the previous index might point past the new list length.
  useEffect(() => {
    setActiveIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent): boolean => {
      if (event.key === 'ArrowDown') {
        if (items.length === 0) return false;
        setActiveIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        if (items.length === 0) return false;
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const picked = items[activeIndex];
        if (picked) {
          command(picked);
          return true;
        }
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="w-72 rounded-md border bg-popover p-3 text-xs text-muted-foreground shadow-md">
        No workspace members match. Press <kbd>Esc</kbd> to keep typing.
      </div>
    );
  }

  return (
    <ul
      role="listbox"
      className="max-h-64 w-72 overflow-y-auto rounded-md border bg-popover py-1 shadow-md"
    >
      {items.map((item, i) => (
        <li key={item.id}>
          <button
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseDown={(e) => {
              // preventDefault so the editor doesn't lose focus before
              // command() runs and inserts the node.
              e.preventDefault();
              command(item);
            }}
            className={cn(
              'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs',
              i === activeIndex ? 'bg-accent' : 'hover:bg-accent/50',
            )}
          >
            <Avatar className="h-6 w-6 shrink-0">
              {item.avatarUrl ? <AvatarImage src={item.avatarUrl} alt={item.fullName} /> : null}
              <AvatarFallback className="text-[9px]">{initials(item.fullName)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate font-medium">{item.fullName}</span>
            <span className="shrink-0 text-muted-foreground">@{item.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
});

/**
 * Convert a workspace-members response into the MentionItem shape TipTap
 * expects. Filters out seeded fake teammates — they can't log in to read
 * a notification, so mentioning them silently drops on the backend
 * anyway; hiding them from the picker prevents that dead-end UX.
 */
export function toMentionItems(members: WorkspaceMemberResponse[]): MentionItem[] {
  return members
    .filter((m) => !m.user.isSeeded)
    .map((m) => ({
      id: m.user.id,
      label: m.user.username,
      fullName: m.user.fullName,
      avatarUrl: m.user.avatarUrl,
    }));
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
