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
import { useCreateProject, useWorkspaceMembers } from '@/lib/hooks/use-board-data';
import type { Priority } from '@/lib/api/types';

const PRIORITIES: Priority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export interface AddProjectModalProps {
  workspaceSlug: string;
}

/**
 * "+ Add project" button that opens a modal with the create-project form.
 * Fields:
 *   - name (required)
 *   - description (optional)
 *   - priority (default NONE)
 *   - leadUserId (optional — dropdown of workspace members)
 *   - dueDate (optional — native date input for simplicity)
 *
 * On success: closes the modal, invalidates the projects cache; the list
 * refetches and the new project appears in the grid.
 */
export function AddProjectModal({ workspaceSlug }: AddProjectModalProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('NONE');
  const [leadUserId, setLeadUserId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const members = useWorkspaceMembers(workspaceSlug);
  const create = useCreateProject(workspaceSlug);

  const reset = () => {
    setName('');
    setDescription('');
    setPriority('NONE');
    setLeadUserId('');
    setDueDate('');
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
      {
        name: trimmed,
        description: description.trim() || undefined,
        priority,
        leadUserId: leadUserId || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Failed to create project');
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
        Add project
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Website redesign"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
            <Input
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional short summary"
              maxLength={280}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="project-priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => {
                  if (v) setPriority(v as Priority);
                }}
              >
                <SelectTrigger id="project-priority">
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
            <div className="space-y-1.5">
              <Label htmlFor="project-due">Due date</Label>
              <Input
                id="project-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-lead">Lead</Label>
            <Select
              value={leadUserId || 'none'}
              onValueChange={(v) => {
                if (v === null) return;
                setLeadUserId(v === 'none' ? '' : v);
              }}
            >
              <SelectTrigger id="project-lead">
                <SelectValue placeholder="No lead" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No lead</SelectItem>
                {(members.data ?? []).map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.user.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              {create.isPending ? 'Creating…' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
