'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Maximize2, Trash2 } from 'lucide-react';
import { ActivityFeed } from './activity-feed';
import { CommentsPanel } from './comments-panel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Priority, TaskResponse } from '@/lib/api/types';
import {
  useDeleteTask,
  useLabels,
  useMyWorkspaceRole,
  useStatuses,
  useTask,
  useUpdateTask,
  useWorkspaceMembers,
} from '@/lib/hooks/use-board-data';
import { useAutosaveField } from '@/lib/hooks/use-autosave-field';
import { useAuthStore } from '@/lib/stores/auth-store';

const PRIORITIES: Priority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const PRIORITY_LABEL: Record<Priority, string> = {
  NONE: 'No priority',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export interface TaskDetailProps {
  workspaceSlug: string;
  taskId: string;
  /** Called after a successful delete, so the parent (modal/page) can
   *  navigate away. Optional — omit for the full-page variant which just
   *  renders an empty state after delete. */
  onDeleted?: () => void;
  /** Optional — when provided, header shows a maximize icon that
   *  navigates to the dedicated full-page task view (no modal, no
   *  board underneath). Omit on the full-page variant itself to hide
   *  the button. */
  onExpandToFullPage?: () => void;
}

/**
 * Shared task detail body — used by both the intercepted modal and the
 * full-page variant. Left column holds the editable title + description;
 * right column has selects/chips for status/priority/assignees/labels/dates.
 *
 * Every field auto-saves — text fields debounce 500 ms via useAutosaveField;
 * selects and date inputs commit immediately on change. Optimistic patches
 * in useUpdateTask keep the cache and every list slot in sync. Comments,
 * resources, subtasks, and the activity feed all ship in a follow-up PR.
 */
export function TaskDetail({
  workspaceSlug,
  taskId,
  onDeleted,
  onExpandToFullPage,
}: TaskDetailProps) {
  const task = useTask(workspaceSlug, taskId);

  if (task.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading task…</div>;
  }
  if (task.error || !task.data) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Task not found. It may have been deleted or you may not have access.
      </div>
    );
  }
  return (
    <TaskDetailBody
      workspaceSlug={workspaceSlug}
      task={task.data}
      onDeleted={onDeleted}
      onExpandToFullPage={onExpandToFullPage}
    />
  );
}

function TaskDetailBody({
  workspaceSlug,
  task,
  onDeleted,
  onExpandToFullPage,
}: {
  workspaceSlug: string;
  task: TaskResponse;
  onDeleted?: () => void;
  onExpandToFullPage?: () => void;
}) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  // Fall back to MEMBER while the members list is loading so moderator
  // affordances don't briefly appear for users who don't have them.
  const workspaceRole = useMyWorkspaceRole(workspaceSlug, currentUserId) ?? 'MEMBER';
  const update = useUpdateTask(workspaceSlug);
  const remove = useDeleteTask(workspaceSlug);
  const statuses = useStatuses(workspaceSlug);
  const members = useWorkspaceMembers(workspaceSlug);
  const labels = useLabels(workspaceSlug);

  const [title, setTitle] = useAutosaveField(task.title, (next) => {
    if (next.trim()) update.mutate({ taskId: task.id, input: { title: next.trim() } });
  });
  const [description, setDescription] = useAutosaveField(task.description ?? '', (next) => {
    update.mutate({
      taskId: task.id,
      input: { description: next.trim() ? next : null },
    });
  });

  // Assignees & labels are click-to-toggle — maintained as local state so
  // the chip highlight flips immediately on click, independent of when
  // the server round-trip lands. Sync to server via useUpdateTask.
  //
  // Local state is seeded from task.assignees / task.labels on first
  // mount, then only re-synced when the SERVER version changes AND the
  // set of ids differs from what we last committed. That way an unrelated
  // refetch doesn't fight with a fast series of user clicks, but truly
  // fresh data (someone else edited the task) does snap in.
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(
    () => new Set(task.assignees.map((a) => a.id)),
  );
  const [labelIds, setLabelIds] = useState<Set<string>>(
    () => new Set(task.labels.map((l) => l.id)),
  );
  const serverAssigneeKey = task.assignees
    .map((a) => a.id)
    .sort()
    .join(',');
  const serverLabelKey = task.labels
    .map((l) => l.id)
    .sort()
    .join(',');
  const lastCommittedAssigneesRef = useRef(serverAssigneeKey);
  const lastCommittedLabelsRef = useRef(serverLabelKey);
  useEffect(() => {
    if (serverAssigneeKey !== lastCommittedAssigneesRef.current) {
      setAssigneeIds(new Set(task.assignees.map((a) => a.id)));
      lastCommittedAssigneesRef.current = serverAssigneeKey;
    }
    if (serverLabelKey !== lastCommittedLabelsRef.current) {
      setLabelIds(new Set(task.labels.map((l) => l.id)));
      lastCommittedLabelsRef.current = serverLabelKey;
    }
  }, [serverAssigneeKey, serverLabelKey, task.assignees, task.labels]);

  // Single-assignee: click a chip to make them the sole assignee; click
  // the currently-selected chip to unassign. Backend accepts an array so
  // we send one-of or empty.
  const toggleAssignee = (userId: string) => {
    setAssigneeIds((prev) => {
      const next: Set<string> = prev.has(userId) ? new Set() : new Set([userId]);
      lastCommittedAssigneesRef.current = [...next].sort().join(',');
      update.mutate({ taskId: task.id, input: { assigneeIds: [...next] } });
      return next;
    });
  };
  const toggleLabel = (labelId: string) => {
    setLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      lastCommittedLabelsRef.current = [...next].sort().join(',');
      update.mutate({ taskId: task.id, input: { labelIds: [...next] } });
      return next;
    });
  };

  const reporter = members.data?.find((m) => m.userId === task.reporterId)?.user;

  return (
    <div className="flex h-full max-h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 border-b px-6 py-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-auto flex-1 border-0 bg-transparent px-0 py-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          aria-label="Task title"
        />
        <SavingIndicator saving={update.isPending} />
        {onExpandToFullPage ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onExpandToFullPage}
            aria-label="Open in full page"
            title="Open in full page"
          >
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            if (typeof window !== 'undefined' && !window.confirm('Delete this task?')) return;
            remove.mutate(task.id, {
              onSuccess: () => onDeleted?.(),
            });
          }}
          disabled={remove.isPending}
          aria-label="Delete task"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </Button>
      </div>

      {/* Body: two-column on desktop, stacked on mobile */}
      <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-[1fr_260px]">
        {/* Left — description + placeholder sections */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description…"
              className={cn(
                'min-h-32 w-full rounded-md border bg-transparent px-3 py-2 text-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            />
          </div>

          <SectionPlaceholder
            title="Subtasks"
            body="Subtasks land in a follow-up. Backend already supports them via parentTaskId."
          />
          <SectionPlaceholder
            title="Resources"
            body="Link + Cloudinary file upload ship in the next task-detail PR."
          />
          <CommentsPanel
            workspaceSlug={workspaceSlug}
            taskId={task.id}
            workspaceRole={workspaceRole}
          />
          <ActivityFeed workspaceSlug={workspaceSlug} taskId={task.id} />
        </div>

        {/* Right — details panel */}
        <aside className="space-y-3">
          {/* Status */}
          <FieldRow label="Status">
            <Select
              value={task.statusId}
              onValueChange={(v) => {
                if (v) update.mutate({ taskId: task.id, input: { statusId: v } });
              }}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(statuses.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          {/* Priority */}
          <FieldRow label="Priority">
            <Select
              value={task.priority}
              onValueChange={(v) => {
                if (v) update.mutate({ taskId: task.id, input: { priority: v as Priority } });
              }}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          {/* Dates */}
          <FieldRow label="Start date">
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                value={task.startDate ? task.startDate.slice(0, 10) : ''}
                onChange={(e) =>
                  update.mutate({
                    taskId: task.id,
                    input: {
                      startDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                    },
                  })
                }
                className="h-8 pl-7 text-xs"
              />
            </div>
          </FieldRow>
          <FieldRow label="Due date">
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                onChange={(e) =>
                  update.mutate({
                    taskId: task.id,
                    input: {
                      dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                    },
                  })
                }
                className="h-8 pl-7 text-xs"
              />
            </div>
          </FieldRow>

          {/* Assignee — single-select chip grid */}
          <FieldRow label="Assignee">
            <ChipToggleList
              items={(members.data ?? []).map((m) => ({ id: m.userId, label: m.user.fullName }))}
              selected={assigneeIds}
              onToggle={toggleAssignee}
              empty="No workspace members yet"
            />
          </FieldRow>

          {/* Labels */}
          <FieldRow label="Labels">
            <ChipToggleList
              items={(labels.data ?? []).map((l) => ({
                id: l.id,
                label: l.name,
                colour: l.color,
              }))}
              selected={labelIds}
              onToggle={toggleLabel}
              empty="No labels defined yet"
            />
          </FieldRow>

          {/* Reporter — read-only */}
          <FieldRow label="Reporter">
            {reporter ? (
              <div className="flex items-center gap-2 text-xs">
                <Avatar className="h-5 w-5">
                  {reporter.avatarUrl ? (
                    <AvatarImage src={reporter.avatarUrl} alt={reporter.fullName} />
                  ) : null}
                  <AvatarFallback className="text-[9px]">
                    {initials(reporter.fullName)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{reporter.fullName}</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Unknown</span>
            )}
          </FieldRow>
        </aside>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SectionPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed p-3">
      <p className="text-xs font-medium">{title}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{body}</p>
    </div>
  );
}

interface ChipToggleListProps {
  items: Array<{ id: string; label: string; colour?: string }>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  empty: string;
}

function ChipToggleList({ items, selected, onToggle, empty }: ChipToggleListProps) {
  if (items.length === 0) {
    return <p className="text-[11px] text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded-md border p-1.5">
      {items.map((it) => {
        const active = selected.has(it.id);
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onToggle(it.id)}
            className={cn(
              'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-muted',
            )}
            style={
              active && it.colour
                ? { backgroundColor: it.colour, borderColor: it.colour, color: '#fff' }
                : undefined
            }
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function SavingIndicator({ saving }: { saving: boolean }) {
  return (
    <span
      className={cn(
        'text-[10px] italic text-muted-foreground/70 transition-opacity',
        saving ? 'opacity-100' : 'opacity-0',
      )}
    >
      Saving…
    </span>
  );
}

function initials(text: string): string {
  const parts = text.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
