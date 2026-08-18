'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { WorkspaceMemberResponse } from '@/lib/api/types';

export interface MentionPickerProps {
  members: WorkspaceMemberResponse[];
  activeIndex: number;
  onSelect: (username: string) => void;
  onHover: (index: number) => void;
}

/**
 * The dropdown that appears under the composer when the user types `@`.
 * Purely presentational — the composer owns the filtering, keyboard nav,
 * and selection semantics; this just renders what it's given.
 *
 * Shows fullName as the primary label so users can find a teammate by
 * the name they know, plus the `@username` in muted text so users learn
 * the string that actually gets inserted (which is what mention delivery
 * matches against on the backend).
 */
export function MentionPicker({ members, activeIndex, onSelect, onHover }: MentionPickerProps) {
  if (members.length === 0) {
    return (
      <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border bg-popover p-3 text-xs text-muted-foreground shadow-md">
        No workspace members match. Press <kbd>Esc</kbd> to keep typing.
      </div>
    );
  }
  return (
    <ul
      role="listbox"
      className="absolute left-0 top-full z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-md border bg-popover py-1 shadow-md"
    >
      {members.map((m, i) => (
        <li key={m.userId}>
          <button
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => {
              // preventDefault stops the textarea losing focus before we can
              // insert — otherwise the picker unmounts on blur mid-click.
              e.preventDefault();
              onSelect(m.user.username);
            }}
            className={cn(
              'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs',
              i === activeIndex ? 'bg-accent' : 'hover:bg-accent/50',
            )}
          >
            <Avatar className="h-6 w-6 shrink-0">
              {m.user.avatarUrl ? (
                <AvatarImage src={m.user.avatarUrl} alt={m.user.fullName} />
              ) : null}
              <AvatarFallback className="text-[9px]">{initials(m.user.fullName)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate font-medium">{m.user.fullName}</span>
            <span className="shrink-0 text-muted-foreground">@{m.user.username}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
