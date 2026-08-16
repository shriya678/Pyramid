'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import type { Role, StatusResponse } from '@/lib/api/types';
import { fractionalIndexAt } from '@/lib/board/fractional-index';
import {
  useCreateStatus,
  useDeleteStatus,
  useStatuses,
  useUpdateStatus,
} from '@/lib/hooks/use-board-data';

/** Preset color palette. Users can also pick a custom hex via native input. */
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
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export interface StatusesPanelProps {
  workspaceSlug: string;
  workspaceRole: Role;
}

/**
 * Workspace status management (Settings). Lists every status in Status.order
 * ascending, with inline rename, colour swatch, up/down reorder buttons,
 * and delete-with-move-to. Add form at the top.
 *
 * All editing is OWNER/ADMIN-gated to match the backend. MEMBER/COLLABORATOR
 * see the same list read-only.
 */
export function StatusesPanel({ workspaceSlug, workspaceRole }: StatusesPanelProps) {
  const statuses = useStatuses(workspaceSlug);
  const create = useCreateStatus(workspaceSlug);
  const update = useUpdateStatus(workspaceSlug);
  const remove = useDeleteStatus(workspaceSlug);
  const canManage = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(PALETTE[1]);
  const [addError, setAddError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<StatusResponse | null>(null);

  const rows = (statuses.data ?? []).slice().sort((a, b) => a.order - b.order);

  const submitCreate = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      setAddError('Name required');
      return;
    }
    if (!HEX_RE.test(newColor)) {
      setAddError('Color must be a 6-digit hex like #3b82f6');
      return;
    }
    setAddError(null);
    create.mutate(
      { name, color: newColor },
      {
        onSuccess: () => {
          setNewName('');
          setNewColor(PALETTE[1]);
          setShowAdd(false);
        },
        onError: (err) => setAddError(extractErrorMessage(err, 'Failed to create status')),
      },
    );
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    // Swap logic: place the current status just before its predecessor.
    // Use fractionalIndexAt with the list minus current, targeting the
    // index of the item that was previously above.
    const without = rows.filter((_, i) => i !== idx);
    const newOrder = fractionalIndexAt(
      without.map((s) => ({ order: s.order })),
      idx - 1,
    );
    update.mutate({ statusId: rows[idx]!.id, input: { order: newOrder } });
  };
  const moveDown = (idx: number) => {
    if (idx >= rows.length - 1) return;
    const without = rows.filter((_, i) => i !== idx);
    const newOrder = fractionalIndexAt(
      without.map((s) => ({ order: s.order })),
      idx + 1,
    );
    update.mutate({ statusId: rows[idx]!.id, input: { order: newOrder } });
  };

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Statuses</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Columns on the board. Deleting a status moves its tasks to another status you pick.
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setShowAdd((v) => !v)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add status
          </Button>
        ) : null}
      </header>

      {showAdd && canManage ? (
        <form onSubmit={submitCreate} className="border-b px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Status name"
              autoFocus
              className="h-8 text-sm"
              maxLength={40}
              aria-label="Status name"
            />
            <ColorPickerInline value={newColor} onChange={setNewColor} />
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAdd(false);
                  setNewName('');
                  setAddError(null);
                }}
                disabled={create.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={create.isPending || !newName.trim()}>
                {create.isPending ? 'Adding…' : 'Add'}
              </Button>
            </div>
          </div>
          {addError ? (
            <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {addError}
            </p>
          ) : null}
        </form>
      ) : null}

      <ul className="divide-y">
        {statuses.isLoading ? (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</li>
        ) : statuses.error ? (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">
            Failed to load statuses.
          </li>
        ) : (
          rows.map((s, idx) => (
            <StatusRow
              key={s.id}
              status={s}
              canManage={canManage}
              isFirst={idx === 0}
              isLast={idx === rows.length - 1}
              onRename={(name) => update.mutate({ statusId: s.id, input: { name } })}
              onRecolor={(color) => update.mutate({ statusId: s.id, input: { color } })}
              onMoveUp={() => moveUp(idx)}
              onMoveDown={() => moveDown(idx)}
              onDelete={() => setDeleteTarget(s)}
            />
          ))
        )}
      </ul>

      {deleteTarget ? (
        <DeleteStatusDialog
          status={deleteTarget}
          otherStatuses={rows.filter((s) => s.id !== deleteTarget.id)}
          isDeleting={remove.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={(moveTo) => {
            remove.mutate(
              { statusId: deleteTarget.id, moveTo },
              { onSuccess: () => setDeleteTarget(null) },
            );
          }}
        />
      ) : null}
    </section>
  );
}

interface StatusRowProps {
  status: StatusResponse;
  canManage: boolean;
  isFirst: boolean;
  isLast: boolean;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

function StatusRow({
  status,
  canManage,
  isFirst,
  isLast,
  onRename,
  onRecolor,
  onMoveUp,
  onMoveDown,
  onDelete,
}: StatusRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(status.name);

  const commitName = () => {
    const trimmed = draftName.trim();
    setEditing(false);
    if (trimmed && trimmed !== status.name) onRename(trimmed);
    else setDraftName(status.name);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitName();
    } else if (e.key === 'Escape') {
      setEditing(false);
      setDraftName(status.name);
    }
  };

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      {canManage ? (
        <ColorPickerInline value={status.color} onChange={onRecolor} compact />
      ) : (
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: status.color }}
          aria-hidden
        />
      )}

      {canManage && editing ? (
        <Input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
          onKeyDown={onKey}
          autoFocus
          maxLength={40}
          className="h-7 flex-1 text-sm"
          aria-label="Status name"
        />
      ) : (
        <button
          type="button"
          onClick={() => canManage && setEditing(true)}
          disabled={!canManage}
          className={cn(
            'min-w-0 flex-1 truncate text-left text-sm',
            canManage ? 'rounded px-1 py-0.5 hover:bg-muted/50' : 'cursor-default text-foreground',
          )}
        >
          {status.name}
        </button>
      )}

      {canManage ? (
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label={`Move ${status.name} up`}
            title="Move up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label={`Move ${status.name} down`}
            title="Move down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={`Delete ${status.name}`}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function ColorPickerInline({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-block shrink-0 rounded-full border border-border/50 ring-offset-background',
          'transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          compact ? 'h-4 w-4' : 'h-8 w-8',
        )}
        style={{ backgroundColor: value }}
        aria-label="Pick colour"
        title={value}
      />
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close picker"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 flex items-center gap-1.5 rounded-md border bg-popover p-2 shadow-md">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={cn(
                  'h-5 w-5 rounded-full border ring-offset-background transition-transform hover:scale-110',
                  value.toLowerCase() === c ? 'border-foreground' : 'border-border/50',
                )}
                style={{ backgroundColor: c }}
                title={c}
                aria-label={`Colour ${c}`}
              />
            ))}
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
              aria-label="Custom colour"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function DeleteStatusDialog({
  status,
  otherStatuses,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  status: StatusResponse;
  otherStatuses: StatusResponse[];
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: (moveTo: string) => void;
}) {
  const [moveTo, setMoveTo] = useState<string>(otherStatuses[0]?.id ?? '');

  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{status.name}”</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Any tasks in this status will be moved to the status you pick below. The status will
            then be removed.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="move-to">Move tasks to</Label>
            <Select
              value={moveTo}
              onValueChange={(v) => {
                if (v) setMoveTo(v);
              }}
            >
              <SelectTrigger id="move-to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {otherStatuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onConfirm(moveTo)}
            disabled={isDeleting || !moveTo}
          >
            {isDeleting ? 'Deleting…' : 'Delete status'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
