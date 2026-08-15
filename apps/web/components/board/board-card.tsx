'use client';

/* eslint-disable react-hooks/refs -- @dnd-kit's useSortable returns a
   callback setNodeRef plus plain attribute/listener objects; the new
   React 19 compiler rule flags these as "ref access during render" but
   they're safe library-level patterns, not React refs. */

import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { Priority, TaskAssigneeMini, TaskLabelMini, TaskResponse } from '@/lib/api/types';
import { usePreferencesStore } from '@/lib/stores/preferences-store';
import { useWorkspaceMembers } from '@/lib/hooks/use-board-data';

/** Priority pill colour ramp. NONE renders no chip at all. */
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

export interface BoardCardProps {
  workspaceSlug: string;
  task: TaskResponse;
}

/**
 * Kanban card. Clicking navigates to the (still-placeholder) task detail
 * route — once the Task Detail modal ships in a follow-up PR the URL will
 * open the intercepted modal instead of a full page nav.
 */
export function BoardCard({ workspaceSlug, task }: BoardCardProps) {
  const fields = usePreferencesStore((s) => s.boardFields);
  const members = useWorkspaceMembers(workspaceSlug);
  const overdue = isOverdue(task);

  // Sortable adapter: exposes attributes + drag listeners we attach below,
  // plus the transform + transition that CSS uses to move the card as the
  // user drags. `data` is echoed back on onDragEnd so the board can tell
  // "card" events apart from "column" events.
  const sortable = useSortable({
    id: task.id,
    data: { type: 'card', task },
  });
  const dragStyle = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : undefined,
  };

  const showPriority = fields.priority && task.priority !== 'NONE';
  const showLabels = fields.labels && task.labels.length > 0;
  const showDueDate = fields.dueDate && task.dueDate !== null;
  const showAssignees = fields.members && task.assignees.length > 0;
  const showReporter = fields.reporter;

  const showMetaRow = showPriority || showLabels;
  const showFooterRow = showDueDate || showAssignees || showReporter;

  const reporter = showReporter
    ? members.data?.find((m) => m.userId === task.reporterId)
    : undefined;

  return (
    <Link
      ref={sortable.setNodeRef}
      href={`/w/${workspaceSlug}/t/${task.id}`}
      style={dragStyle}
      className={cn(
        'group block touch-none rounded-lg border bg-card p-3 text-left shadow-sm transition-shadow',
        'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        overdue && fields.dueDate && 'border-red-300 dark:border-red-900/60',
      )}
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <p className="text-sm font-medium leading-snug text-foreground">{task.title}</p>

      {showMetaRow && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {showPriority && (
            <span
              className={cn(
                'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
                PRIORITY_STYLES[task.priority as Exclude<Priority, 'NONE'>],
              )}
            >
              {PRIORITY_LABEL[task.priority as Exclude<Priority, 'NONE'>]}
            </span>
          )}
          {showLabels && task.labels.slice(0, 2).map((l) => <LabelChip key={l.id} label={l} />)}
          {showLabels && task.labels.length > 2 && (
            <span className="text-[10px] text-muted-foreground">+{task.labels.length - 2}</span>
          )}
        </div>
      )}

      {showFooterRow && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            {showDueDate ? <DueDate iso={task.dueDate!} overdue={overdue} /> : null}
            {showReporter && reporter ? (
              <span className="truncate text-[10px] text-muted-foreground/70">
                by {reporter.user.fullName}
              </span>
            ) : null}
          </div>
          {showAssignees ? <AssigneeStack assignees={task.assignees} /> : null}
        </div>
      )}
    </Link>
  );
}

function LabelChip({ label }: { label: TaskLabelMini }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${label.color}20`, color: label.color }}
    >
      {label.name}
    </span>
  );
}

function DueDate({ iso, overdue }: { iso: string; overdue: boolean }) {
  const d = new Date(iso);
  const formatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <span
      className={cn(
        'text-[11px]',
        overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground',
      )}
    >
      {formatted}
    </span>
  );
}

function AssigneeStack({ assignees }: { assignees: TaskAssigneeMini[] }) {
  if (assignees.length === 0) return null;
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
      {overflow > 0 && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground ring-1 ring-background">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function isOverdue(task: TaskResponse): boolean {
  if (!task.dueDate) return false;
  // Overdue only visually matters for open tasks — a completed task past its
  // due date shouldn't shout red. Status is workspace-defined so we can't
  // hard-code "Completed"; the frontend just cares whether the due date is
  // past. Refine later if we introduce a "closed" flag on Status.
  return new Date(task.dueDate).getTime() < Date.now();
}

function initials(text: string): string {
  const parts = text.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
