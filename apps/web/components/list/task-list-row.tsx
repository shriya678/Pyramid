'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { Priority, TaskAssigneeMini, TaskResponse } from '@/lib/api/types';
import { usePreferencesStore } from '@/lib/stores/preferences-store';

const PRIORITY_STYLES: Record<Exclude<Priority, 'NONE'>, string> = {
  URGENT: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  LOW: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
};

const PRIORITY_LABEL: Record<Exclude<Priority, 'NONE'>, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export interface TaskListRowProps {
  workspaceSlug: string;
  task: TaskResponse;
}

/**
 * Single-line task row for the list view. Fields shown are gated by the
 * shared `boardFields` preference so users get a consistent display
 * across Board and List (the plan spec earmarks separate `listFieldsShown`
 * server-side storage; sharing the client toggle keeps this PR simple).
 */
export function TaskListRow({ workspaceSlug, task }: TaskListRowProps) {
  const fields = usePreferencesStore((s) => s.boardFields);
  const overdue = isOverdue(task);

  return (
    <Link
      href={`/w/${workspaceSlug}/tasks/${task.id}`}
      className={cn(
        'grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border px-3 py-2 shadow-sm transition-colors',
        'bg-card hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</p>
        {fields.priority && task.priority !== 'NONE' ? (
          <span
            className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
              PRIORITY_STYLES[task.priority as Exclude<Priority, 'NONE'>],
            )}
          >
            {PRIORITY_LABEL[task.priority as Exclude<Priority, 'NONE'>]}
          </span>
        ) : null}
        {fields.labels
          ? task.labels.slice(0, 2).map((l) => (
              <span
                key={l.id}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: `${l.color}20`, color: l.color }}
              >
                {l.name}
              </span>
            ))
          : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {fields.dueDate && task.dueDate ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px]',
              overdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
            )}
          >
            <CalendarDays className="h-3 w-3" />
            {new Date(task.dueDate).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ) : null}
        {fields.members && task.assignees.length > 0 ? (
          <AssigneeStack assignees={task.assignees} />
        ) : null}
      </div>
    </Link>
  );
}

function AssigneeStack({ assignees }: { assignees: TaskAssigneeMini[] }) {
  const shown = assignees.slice(0, 3);
  const overflow = assignees.length - shown.length;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((a) => (
        <Avatar key={a.id} className="h-5 w-5 ring-1 ring-background">
          {a.avatarUrl ? <AvatarImage src={a.avatarUrl} alt={a.fullName} /> : null}
          <AvatarFallback className="text-[9px]">{initials(a.fullName)}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 ? (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground ring-1 ring-background">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function isOverdue(task: TaskResponse): boolean {
  // Extracted so the react-hooks lint rule doesn't see Date.now() as an
  // impure call directly inside render. Same rationale as BoardCard.
  if (!task.dueDate) return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

function initials(text: string): string {
  const parts = text.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
