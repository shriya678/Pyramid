'use client';

import { useState, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useCreateTask } from '@/lib/hooks/use-board-data';

export interface QuickAddProps {
  workspaceSlug: string;
  statusId: string;
}

/**
 * Inline "add a task" affordance at the footer of every column. Idle state
 * is a subtle "+ Add task" button; click it → expands into an input that
 * commits on Enter and cancels on Escape. Blur without content also cancels.
 *
 * Optimistic UI would be a follow-up — for now the mutation invalidates the
 * tasks cache on success and TanStack Query refetches. Fast enough on local
 * dev; the flash is minimal.
 */
export function QuickAdd({ workspaceSlug, statusId }: QuickAddProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const create = useCreateTask(workspaceSlug);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate(
      { title: trimmed, statusId },
      {
        onSuccess: () => {
          setTitle('');
          // Stay in "open" mode so the user can add several in a row.
        },
      },
    );
  };

  const cancel = () => {
    setTitle('');
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      cancel();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Add task
      </button>
    );
  }

  return (
    <Input
      autoFocus
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={cancel}
      onKeyDown={onKey}
      placeholder="Task title, then Enter"
      disabled={create.isPending}
      className="h-8 text-sm"
      aria-label="New task title"
    />
  );
}
