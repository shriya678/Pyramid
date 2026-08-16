'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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
import { extractErrorMessage } from '@/lib/api/error-message';
import { useCreateWorkspace } from '@/lib/hooks/use-workspaces';
import { useAuthStore } from '@/lib/stores/auth-store';

export interface CreateWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Controlled modal for creating a new workspace. On success:
 *   1. Invalidates the workspace list (hooked inside useCreateWorkspace)
 *   2. Sets the newly created workspace as the active one in the auth store
 *   3. Navigates to the new workspace's Tasks board
 *
 * Server provisions the workspace with default statuses only — no
 * seeded teammates / demo project (see backend WorkspaceProvisioningService).
 */
export function CreateWorkspaceModal({ open, onOpenChange }: CreateWorkspaceModalProps) {
  const router = useRouter();
  const create = useCreateWorkspace();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setError(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Workspace name is required');
      return;
    }
    setError(null);
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (ws) => {
          useAuthStore.setState({
            workspace: { id: ws.id, slug: ws.slug, name: ws.name },
          });
          reset();
          onOpenChange(false);
          router.push(`/w/${ws.slug}/tasks`);
        },
        onError: (err) => {
          setError(extractErrorMessage(err, 'Failed to create workspace'));
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-workspace-name">Name</Label>
            <Input
              id="new-workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing 2026"
              autoFocus
              maxLength={80}
              disabled={create.isPending}
            />
            <p className="text-xs text-muted-foreground">
              You&apos;ll be the owner. The board starts with the four default statuses; no
              teammates or demo projects.
            </p>
          </div>
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? 'Creating…' : 'Create workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
