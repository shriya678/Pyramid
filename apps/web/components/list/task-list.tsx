'use client';

import { useMemo } from 'react';
import { useStatuses, useTasks } from '@/lib/hooks/use-board-data';
import type { TaskListQuery } from '@/lib/api/tasks';
import type { TaskResponse } from '@/lib/api/types';
import { TaskListSection } from './task-list-section';

export interface TaskListProps {
  workspaceSlug: string;
  /** Same server-side query shape as the Board — search + filters flow through. */
  query?: TaskListQuery;
}

/**
 * Top-level list view. Fetches statuses + tasks (reusing the same TanStack
 * Query hooks + cache slots as the Board — switching views is instant),
 * groups tasks by statusId, and renders one collapsible section per
 * status ordered by Status.order.
 */
export function TaskList({ workspaceSlug, query = {} }: TaskListProps) {
  const statuses = useStatuses(workspaceSlug);
  const tasks = useTasks(workspaceSlug, query);

  const grouped = useMemo(() => groupByStatus(tasks.data ?? []), [tasks.data]);

  if (statuses.isLoading || tasks.isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
    );
  }
  if (statuses.error || tasks.error) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        Failed to load tasks. Try refreshing.
      </p>
    );
  }

  const columns = statuses.data ?? [];
  if (columns.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        No statuses yet. Add one from Settings → Statuses.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-3 p-4 md:p-6">
      {columns.map((s) => (
        <TaskListSection
          key={s.id}
          workspaceSlug={workspaceSlug}
          status={s}
          tasks={grouped.get(s.id) ?? []}
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
  for (const list of out.values()) {
    list.sort((a, b) => a.orderInColumn - b.orderInColumn);
  }
  return out;
}
