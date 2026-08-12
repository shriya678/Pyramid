'use client';

import type { ReactNode } from 'react';
import type { StatusResponse, TaskResponse } from '@/lib/api/types';
import { BoardCard } from './board-card';

export interface BoardColumnProps {
  workspaceSlug: string;
  status: StatusResponse;
  tasks: TaskResponse[];
  /** Slot rendered at the column footer — quick-add lands here in a later commit. */
  footer?: ReactNode;
}

/**
 * A single Kanban column. Header shows a colour swatch keyed off Status.color
 * plus the status name and current card count. Body is a vertical stack of
 * BoardCards; footer is a slot for quick-add or other actions.
 *
 * Column width is fixed (min-width) so the board can horizontally scroll
 * cleanly on narrow viewports without collapsing.
 */
export function BoardColumn({ workspaceSlug, status, tasks, footer }: BoardColumnProps) {
  return (
    <div className="flex h-full min-h-0 w-72 shrink-0 flex-col rounded-lg border bg-muted/30">
      <header className="flex items-center gap-2 px-3 py-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: status.color }}
          aria-hidden
        />
        <span className="text-sm font-medium">{status.name}</span>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {tasks.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">No tasks yet</p>
        ) : (
          tasks.map((t) => <BoardCard key={t.id} workspaceSlug={workspaceSlug} task={t} />)
        )}
      </div>

      {footer ? <footer className="border-t px-2 py-2">{footer}</footer> : null}
    </div>
  );
}
