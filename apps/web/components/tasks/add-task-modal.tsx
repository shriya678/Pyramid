'use client';

import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { extractErrorMessage } from '@/lib/api/error-message';
import {
  useCreateTask,
  useLabels,
  useProjects,
  useStatuses,
  useWorkspaceMembers,
} from '@/lib/hooks/use-board-data';
import type { Priority } from '@/lib/api/types';

const PRIORITIES: Priority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export interface AddTaskModalProps {
  workspaceSlug: string;
  /** Optional prefill — when triggered from Project Detail, the modal
   *  pre-selects this project so the created task is scoped correctly. */
  defaultProjectId?: string | null;
}

/**
 * Full task-creation form as a dialog. Fields:
 *   - title (required)
 *   - description
 *   - status (required — auto-defaults to first status)
 *   - priority
 *   - project (optional; can be "No project" → orphan task)
 *   - assignees (multi-toggle chip list)
 *   - labels (multi-toggle chip list)
 *   - due date
 *
 * Complementary to the board's inline QuickAdd, which only takes title +
 * status for fast capture. This modal is for when the user wants to fill
 * in the rest at creation time instead of opening the task detail after.
 */
export function AddTaskModal({ workspaceSlug, defaultProjectId }: AddTaskModalProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // undefined = user hasn't picked anything explicitly; falls back to the
  // first status when we compute effectiveStatusId below.
  const [statusId, setStatusId] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<Priority>('NONE');
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? '');
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(new Set());
  const [labelIds, setLabelIds] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const statuses = useStatuses(workspaceSlug);
  const projects = useProjects(workspaceSlug);
  const members = useWorkspaceMembers(workspaceSlug);
  const labels = useLabels(workspaceSlug);
  const create = useCreateTask(workspaceSlug);

  // Default to the first status until the user picks explicitly. Computed
  // at render (no effect) so the React 19 rules don't flag a cascading
  // setState in an effect — the value is stable across renders as long as
  // the statuses list doesn't reorder under us.
  const effectiveStatusId = statusId ?? statuses.data?.[0]?.id ?? '';

  const reset = () => {
    setTitle('');
    setDescription('');
    setStatusId(undefined);
    setPriority('NONE');
    setProjectId(defaultProjectId ?? '');
    setAssigneeIds(new Set());
    setLabelIds(new Set());
    setDueDate('');
    setError(null);
  };

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required');
      return;
    }
    if (!effectiveStatusId) {
      setError('Status is required');
      return;
    }
    setError(null);
    create.mutate(
      {
        title: trimmed,
        description: description.trim() || undefined,
        statusId: effectiveStatusId,
        priority,
        projectId: projectId || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        assigneeIds: assigneeIds.size ? [...assigneeIds] : undefined,
        labelIds: labelIds.size ? [...labelIds] : undefined,
      },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
        onError: (err) => {
          setError(extractErrorMessage(err, 'Failed to create task'));
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-1.5 h-4 w-4" />
        Add task
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to happen?"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Input
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context"
              maxLength={2000}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-status">Status</Label>
              <Select
                value={effectiveStatusId}
                onValueChange={(v) => {
                  if (v) setStatusId(v);
                }}
              >
                <SelectTrigger id="task-status">
                  <SelectValue placeholder="Pick a column" />
                </SelectTrigger>
                <SelectContent>
                  {(statuses.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => {
                  if (v) setPriority(v as Priority);
                }}
              >
                <SelectTrigger id="task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p === 'NONE' ? 'None' : p.charAt(0) + p.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-project">Project</Label>
              <Select
                value={projectId || 'none'}
                onValueChange={(v) => {
                  if (v === null) return;
                  setProjectId(v === 'none' ? '' : v);
                }}
              >
                <SelectTrigger id="task-project">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {(projects.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <ChipMultiSelect
            label="Assignee"
            options={(members.data ?? []).map((m) => ({ id: m.userId, label: m.user.fullName }))}
            selected={assigneeIds}
            // Single-select: picking one deselects the other; clicking the
            // current selection clears it.
            onToggle={(id) => setAssigneeIds((prev) => (prev.has(id) ? new Set() : new Set([id])))}
            empty="No workspace members yet"
          />
          <ChipMultiSelect
            label="Labels"
            options={(labels.data ?? []).map((l) => ({ id: l.id, label: l.name, colour: l.color }))}
            selected={labelIds}
            onToggle={(id) => setLabelIds((prev) => toggle(prev, id))}
            empty="No labels yet — add some from a task"
          />

          {error ? (
            <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ChipMultiSelectProps {
  label: string;
  options: Array<{ id: string; label: string; colour?: string }>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  empty: string;
}

function ChipMultiSelect({ label, options, selected, onToggle, empty }: ChipMultiSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-md border p-2">
          {options.map((o) => {
            const active = selected.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onToggle(o.id)}
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:bg-muted',
                )}
                style={
                  active && o.colour
                    ? { backgroundColor: o.colour, borderColor: o.colour, color: '#fff' }
                    : undefined
                }
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
