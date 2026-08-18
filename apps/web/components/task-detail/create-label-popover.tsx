'use client';

import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { extractErrorMessage } from '@/lib/api/error-message';
import { useCreateLabel } from '@/lib/hooks/use-board-data';
import type { LabelResponse } from '@/lib/api/types';

/**
 * Same 8-color palette Statuses use — keeps the visual language of
 * "workspace primitives" (statuses, labels) consistent.
 */
const PALETTE = [
  '#94a3b8', // slate
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
] as const;

export interface CreateLabelPopoverProps {
  workspaceSlug: string;
  /**
   * Called with the newly created label. Wired by the task-detail Labels
   * row to immediately toggle the label onto the current task — the "create
   * AND assign" gesture users expect when they hit + inside a task picker.
   */
  onCreated: (label: LabelResponse) => void;
  /** Hidden for COLLABORATOR — passed through so the trigger can gate itself. */
  disabled?: boolean;
}

/**
 * "+ New label" chip that opens a popover with name + color picker. Creates
 * the label AND (via onCreated) assigns it to the current task in one gesture,
 * matching the pattern Slack/Linear use for on-the-fly taxonomy edits.
 *
 * Backend enforces:
 *   - name uniqueness per workspace (409 → surfaced inline)
 *   - 6-digit hex color (400 → surfaced inline)
 */
export function CreateLabelPopover({
  workspaceSlug,
  onCreated,
  disabled,
}: CreateLabelPopoverProps) {
  const create = useCreateLabel(workspaceSlug);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PALETTE[1]);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setColor(PALETTE[1]);
    setError(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setError(null);
    create.mutate(
      { name: trimmed, color },
      {
        onSuccess: (label) => {
          onCreated(label);
          reset();
          setOpen(false);
        },
        onError: (err) => {
          setError(extractErrorMessage(err, 'Failed to create label'));
        },
      },
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        setOpen(next);
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors',
          disabled
            ? 'cursor-not-allowed opacity-40'
            : 'hover:border-foreground hover:text-foreground',
        )}
      >
        <Plus className="h-2.5 w-2.5" />
        New label
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3" sideOffset={6}>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-label-name" className="text-xs">
              Name
            </Label>
            <Input
              id="new-label-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bug, Feature, P1"
              autoFocus
              maxLength={40}
              disabled={create.isPending}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <div className="flex gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Pick color ${c}`}
                  aria-pressed={color === c}
                  className={cn(
                    'h-6 w-6 rounded-full ring-offset-2 ring-offset-popover transition-shadow',
                    color === c ? 'ring-2 ring-ring' : 'hover:ring-1 hover:ring-ring/50',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {error ? (
            <p className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-7 text-xs"
              disabled={create.isPending || !name.trim()}
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
