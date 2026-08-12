'use client';

import { useMemo } from 'react';
import { useStatuses, useTasks } from '@/lib/hooks/use-board-data';
import type { TaskListQuery } from '@/lib/api/tasks';
import type { TaskResponse } from '@/lib/api/types';
import { BoardColumn } from './board-column';
import { BoardSkeleton } from './board-skeleton';
import { QuickAdd } from './quick-add';

export interface BoardProps {
  workspaceSlug: string;
  /** Server-side filter passed to GET /tasks. Debounced/normalised upstream. */
  query?: TaskListQuery;
}

/**
 * Top-level Kanban surface. Fetches statuses (columns) and tasks
 * concurrently, groups tasks by statusId once loaded, and renders a
 * horizontally-scrollable strip of BoardColumns.
 *
 * Errors: shows a compact retry-hint. Empty workspace (0 statuses) is
 * theoretically impossible after seed but handled defensively.
 */
export function Board({ workspaceSlug, query = {} }: BoardProps) {
  const statuses = useStatuses(workspaceSlug);
  const tasks = useTasks(workspaceSlug, query);

  const grouped = useMemo(() => groupByStatus(tasks.data ?? []), [tasks.data]);

  if (statuses.isLoading || tasks.isLoading) {
    return <BoardSkeleton />;
  }

  if (statuses.error || tasks.error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Failed to load the board. Try refreshing.
      </div>
    );
  }

  const columns = statuses.data ?? [];
  if (columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        No columns yet. Add one from Settings → Statuses.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-nowrap gap-3 overflow-x-auto overflow-y-hidden p-4">
      {columns.map((s) => (
        <BoardColumn
          key={s.id}
          workspaceSlug={workspaceSlug}
          status={s}
          tasks={grouped.get(s.id) ?? []}
          footer={<QuickAdd workspaceSlug={workspaceSlug} statusId={s.id} />}
        />
      ))}
    </div>
  );
}

function groupByStatus(tasks: TaskResponse[]): Map<string, TaskResponse[]> {
  const out = new Map<string, TaskResponse[]>();
  for (const t of tasks) {
    const list = out.get(t.statusId) ?? [];
    list.push(t);
    out.set(t.statusId, list);
  }
  // Preserve orderInColumn ascending — API already returns sorted, but sort
  // again defensively in case the mutation cache stitches an unsorted insert.
  for (const list of out.values()) {
    list.sort((a, b) => a.orderInColumn - b.orderInColumn);
  }
  return out;
}
