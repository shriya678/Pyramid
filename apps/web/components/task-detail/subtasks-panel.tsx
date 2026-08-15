'use client';

import { useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useCreateTask, useStatuses, useTasks } from '@/lib/hooks/use-board-data';

export interface SubtasksPanelProps {
  workspaceSlug: string;
  parentTaskId: string;
  /** Inherit from parent so new subtasks stay scoped correctly. */
  parentProjectId: string | null;
}

/**
 * Subtasks under a parent task — one level of nesting (backend enforces
 * max depth 1). Renders as a compact checklist-style list under the
 * parent's Description, plus a quick-add row for creating a new subtask.
 *
 * Each row links to /w/[slug]/t/[subtaskId] so clicking it opens that
 * subtask in the standard detail modal (with its own Comments / Activity
 * / Resources — subtasks are first-class tasks, they just have parentTaskId
 * set).
 */
export function SubtasksPanel({
  workspaceSlug,
  parentTaskId,
  parentProjectId,
}: SubtasksPanelProps) {
  // useTasks accepts a `parentTaskId` filter — pass this parent's id and
  // the backend returns only its direct children.
  const subtasks = useTasks(workspaceSlug, { parentTaskId });
  const statuses = useStatuses(workspaceSlug);
  const create = useCreateTask(workspaceSlug);
  const [title, setTitle] = useState('');

  const defaultStatusId = statuses.data?.[0]?.id;

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || !defaultStatusId) return;
    create.mutate(
      {
        title: trimmed,
        statusId: defaultStatusId,
        parentTaskId,
        // Subtasks inherit the parent's projectId so they group with the
        // parent in project views. Explicit null preserves orphan state.
        projectId: parentProjectId,
      },
      { onSuccess: () => setTitle('') },
    );
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      setTitle('');
    }
  };

  const rows = subtasks.data ?? [];
  const statusById = new Map((statuses.data ?? []).map((s) => [s.id, s]));

  return (
    <section className="space-y-2">
      <header className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Subtasks</h3>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
      </header>

      {subtasks.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : subtasks.error ? (
        <p className="text-xs text-muted-foreground">Failed to load subtasks.</p>
      ) : rows.length === 0 ? null : (
        <ul className="space-y-1">
          {rows.map((t) => {
            const status = statusById.get(t.statusId);
            return (
              <li key={t.id}>
                <Link
                  href={`/w/${workspaceSlug}/t/${t.id}`}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                    'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                >
                  {status ? (
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: status.color }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  {status ? (
                    <span className="text-[10px] text-muted-foreground">{status.name}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <Plus className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onKey}
          placeholder="Add a subtask, press Enter"
          className="h-8 pl-7 text-xs"
          disabled={create.isPending || !defaultStatusId}
          aria-label="New subtask title"
        />
      </div>
    </section>
  );
}
