'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { QuickAdd } from '@/components/board/quick-add';
import { cn } from '@/lib/utils';
import type { StatusResponse, TaskResponse } from '@/lib/api/types';
import { TaskListRow } from './task-list-row';

export interface TaskListSectionProps {
  workspaceSlug: string;
  status: StatusResponse;
  tasks: TaskResponse[];
}

/**
 * Collapsible section per status. Header shows the same colour-dot / name /
 * count pattern as BoardColumn headers so the visual language is
 * consistent across views. Reuses the Board's <QuickAdd /> at the section
 * footer — same "click to expand, Enter commits, Escape/blur cancels" UX.
 */
export function TaskListSection({ workspaceSlug, status, tasks }: TaskListSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="rounded-lg border bg-muted/20">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 rounded-t-lg px-3 py-2 text-left hover:bg-muted/40"
        aria-expanded={!collapsed}
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            !collapsed && 'rotate-90',
          )}
        />
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: status.color }}
          aria-hidden
        />
        <span className="text-sm font-medium">{status.name}</span>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </button>

      {!collapsed ? (
        <div className="space-y-1.5 px-3 pb-3">
          {tasks.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">No tasks yet</p>
          ) : (
            tasks.map((t) => <TaskListRow key={t.id} workspaceSlug={workspaceSlug} task={t} />)
          )}
          <div className="pt-1">
            <QuickAdd workspaceSlug={workspaceSlug} statusId={status.id} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
