'use client';

import { CalendarDays, User } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Priority, ProjectResponse, Role } from '@/lib/api/types';
import { useUpdateProject, useWorkspaceMembers } from '@/lib/hooks/use-board-data';

const PRIORITIES: Priority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const PRIORITY_STYLES: Record<Exclude<Priority, 'NONE'>, string> = {
  URGENT: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  LOW: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
};

export interface ProjectHeaderProps {
  workspaceSlug: string;
  workspaceRole: Role;
  project: ProjectResponse;
}

/**
 * Project Detail header. Displays name + description, plus a row of
 * meta-field selects for Priority / Lead / Due date. Meta selects
 * auto-save through useUpdateProject — this mirrors the "immediate
 * change, no explicit Save button" pattern the plan calls for on p12.
 *
 * Edit access is workspace-role-gated: only OWNER/ADMIN see interactive
 * controls. MEMBERs and COLLABORATORs see the same info as read-only chips.
 */
export function ProjectHeader({ workspaceSlug, workspaceRole, project }: ProjectHeaderProps) {
  const members = useWorkspaceMembers(workspaceSlug);
  const update = useUpdateProject(workspaceSlug, project.id);
  const canEdit = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';

  const dueDateInputValue = project.dueDate ? project.dueDate.slice(0, 10) : '';
  const lead = project.leadUserId
    ? (members.data ?? []).find((m) => m.userId === project.leadUserId)?.user
    : undefined;

  return (
    <div className="space-y-3 border-b bg-background px-4 py-4 md:px-6">
      <div>
        <h1 className="text-xl font-semibold leading-tight">{project.name}</h1>
        {project.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {/* Priority */}
        {canEdit ? (
          <MetaSelect
            label="Priority"
            value={project.priority}
            onChange={(v) => update.mutate({ priority: v as Priority })}
            options={PRIORITIES.map((p) => ({
              value: p,
              label: p === 'NONE' ? 'No priority' : p.charAt(0) + p.slice(1).toLowerCase(),
            }))}
          />
        ) : (
          <PriorityChip priority={project.priority} />
        )}

        {/* Lead */}
        {canEdit ? (
          <MetaSelect
            label="Lead"
            value={project.leadUserId ?? 'none'}
            onChange={(v) => update.mutate({ leadUserId: v === 'none' ? null : v })}
            options={[
              { value: 'none', label: 'No lead' },
              ...(members.data ?? []).map((m) => ({ value: m.userId, label: m.user.fullName })),
            ]}
          />
        ) : lead ? (
          <span className="inline-flex items-center gap-1 rounded border px-2 py-1">
            <User className="h-3 w-3" />
            {lead.fullName}
          </span>
        ) : null}

        {/* Due date */}
        {canEdit ? (
          <label className="inline-flex items-center gap-1 rounded border px-2 py-1">
            <CalendarDays className="h-3 w-3" />
            <span className="sr-only">Due date</span>
            <Input
              type="date"
              value={dueDateInputValue}
              onChange={(e) =>
                update.mutate({
                  dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
              className="h-6 w-32 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
            />
          </label>
        ) : project.dueDate ? (
          <span className="inline-flex items-center gap-1 rounded border px-2 py-1">
            <CalendarDays className="h-3 w-3" />
            {new Date(project.dueDate).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ) : null}

        {update.isPending ? (
          <span className="text-[10px] italic text-muted-foreground/70">Saving…</span>
        ) : update.isSuccess && !update.isPending ? (
          <span className="text-[10px] italic text-muted-foreground/70">Saved</span>
        ) : null}
      </div>
    </div>
  );
}

interface MetaSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}

function MetaSelect({ label, value, onChange, options }: MetaSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v);
      }}
    >
      <SelectTrigger className="h-7 gap-1 text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PriorityChip({ priority }: { priority: Priority }) {
  if (priority === 'NONE') return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium',
        PRIORITY_STYLES[priority as Exclude<Priority, 'NONE'>],
      )}
    >
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </span>
  );
}
