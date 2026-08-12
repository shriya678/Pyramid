'use client';

/* eslint-disable react-hooks/refs -- see rationale in board-card.tsx */

import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
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
 * DnD wiring:
 *   - The card list is wrapped in a SortableContext keyed by task ids so
 *     @dnd-kit knows the drop targets for reordering.
 *   - The body region is also its own droppable (with data.type=column)
 *     so an empty column still accepts cards dropped from elsewhere.
 *     Card-on-card sorting inside a non-empty column is handled by the
 *     SortableContext's own droppables — we don't need to check both.
 */
export function BoardColumn({ workspaceSlug, status, tasks, footer }: BoardColumnProps) {
  // Column-level sortable: the column itself moves in the outer horizontal
  // strip. Listeners attach only to the drag handle so users can still
  // interact with the column body (scroll, click cards) without triggering
  // a column-drag.
  const columnSortable = useSortable({
    id: `col-${status.id}`,
    data: { type: 'column', statusId: status.id },
  });

  // Card-level droppable — needed only for empty columns; SortableContext's
  // per-item droppables cover the non-empty case.
  const drop = useDroppable({
    id: `column-${status.id}`,
    data: { type: 'column-body', statusId: status.id },
  });

  const columnStyle = {
    transform: CSS.Transform.toString(columnSortable.transform),
    transition: columnSortable.transition,
    opacity: columnSortable.isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={columnSortable.setNodeRef}
      style={columnStyle}
      className="flex h-full min-h-0 w-72 shrink-0 flex-col rounded-lg border bg-muted/30"
      {...columnSortable.attributes}
    >
      <header className="group/header flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/header:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          aria-label={`Drag ${status.name} column`}
          {...columnSortable.listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: status.color }}
          aria-hidden
        />
        <span className="text-sm font-medium">{status.name}</span>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </header>

      <div
        ref={drop.setNodeRef}
        className={cn(
          'flex-1 space-y-2 overflow-y-auto px-2 pb-2 transition-colors',
          drop.isOver && 'bg-primary/5',
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <p className="px-1 py-4 text-center text-xs text-muted-foreground">No tasks yet</p>
          ) : (
            tasks.map((t) => <BoardCard key={t.id} workspaceSlug={workspaceSlug} task={t} />)
          )}
        </SortableContext>
      </div>

      {footer ? <footer className="border-t px-2 py-2">{footer}</footer> : null}
    </div>
  );
}
