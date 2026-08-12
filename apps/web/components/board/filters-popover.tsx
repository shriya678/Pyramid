'use client';

import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLabels, useStatuses, useWorkspaceMembers } from '@/lib/hooks/use-board-data';
import type { TaskListQuery } from '@/lib/api/tasks';
import type { Priority } from '@/lib/api/types';

const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

export interface FiltersPopoverProps {
  workspaceSlug: string;
  value: TaskListQuery;
  onChange: (next: TaskListQuery) => void;
}

/**
 * Popover with checkbox groups for Status / Priority / Labels / Assignees.
 * "Clear" resets everything but `q` (search stays on its own input). "Apply"
 * isn't strictly needed — every toggle fires onChange immediately — but the
 * button doubles as a close affordance.
 */
export function FiltersPopover({ workspaceSlug, value, onChange }: FiltersPopoverProps) {
  const statuses = useStatuses(workspaceSlug);
  const labels = useLabels(workspaceSlug);
  const members = useWorkspaceMembers(workspaceSlug);

  const activeCount = countActive(value);

  const clear = () => onChange({ q: value.q });

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" />}
        aria-label={`Filters${activeCount > 0 ? ` (${activeCount} active)` : ''}`}
      >
        <Filter className="mr-1.5 h-4 w-4" />
        Filters
        {activeCount > 0 && (
          <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
            {activeCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <Section
          title="Status"
          items={(statuses.data ?? []).map((s) => ({ id: s.id, label: s.name }))}
          selected={value.statusIds ?? []}
          onToggle={(id) => onChange({ ...value, statusIds: toggle(value.statusIds ?? [], id) })}
        />
        <Section
          title="Priority"
          items={PRIORITIES.map((p) => ({ id: p, label: labelFor(p) }))}
          selected={value.priority ?? []}
          onToggle={(id) =>
            onChange({ ...value, priority: toggle(value.priority ?? [], id as Priority) })
          }
        />
        <Section
          title="Assignees"
          items={(members.data ?? []).map((m) => ({ id: m.userId, label: m.user.fullName }))}
          selected={value.assigneeIds ?? []}
          onToggle={(id) =>
            onChange({ ...value, assigneeIds: toggle(value.assigneeIds ?? [], id) })
          }
        />
        <Section
          title="Labels"
          items={(labels.data ?? []).map((l) => ({ id: l.id, label: l.name }))}
          selected={value.labelIds ?? []}
          onToggle={(id) => onChange({ ...value, labelIds: toggle(value.labelIds ?? [], id) })}
        />

        <div className="flex justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={clear} disabled={activeCount === 0}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SectionProps {
  title: string;
  items: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}

function Section({ title, items, selected, onToggle }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {items.map((it) => (
          <label
            key={it.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
          >
            <Checkbox
              checked={selected.includes(it.id)}
              onCheckedChange={() => onToggle(it.id)}
              aria-label={it.label}
            />
            <span className="flex-1 truncate">{it.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function countActive(v: TaskListQuery): number {
  return (
    (v.statusIds?.length ?? 0) +
    (v.priority?.length ?? 0) +
    (v.labelIds?.length ?? 0) +
    (v.assigneeIds?.length ?? 0)
  );
}

function labelFor(p: Priority): string {
  return p === 'NONE' ? 'None' : p.charAt(0) + p.slice(1).toLowerCase();
}
