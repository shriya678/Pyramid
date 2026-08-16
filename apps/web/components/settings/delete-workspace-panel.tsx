'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
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
import { useDeleteWorkspace, useWorkspaces } from '@/lib/hooks/use-workspaces';
import { useAuthStore } from '@/lib/stores/auth-store';
import type { Role } from '@/lib/api/types';

export interface DeleteWorkspacePanelProps {
  workspaceSlug: string;
  workspaceName: string;
  workspaceRole: Role;
}

/**
 * Permanently delete a workspace. OWNER only. Backend cascades every
 * workspace-scoped row via Prisma `onDelete: Cascade` — members, projects,
 * tasks, statuses, labels, and all their subordinates. Irreversible.
 *
 * UI safeguards (belt AND suspenders):
 *   1. Only rendered for OWNER (the backend enforces this too).
 *   2. Confirm dialog requires typing the workspace name — Delete button
 *      stays disabled until the input matches exactly.
 *
 * On success: caller is routed to their next remaining workspace, or
 * signed out if they have none (rare — most users keep at least one).
 */
export function DeleteWorkspacePanel({
  workspaceSlug,
  workspaceName,
  workspaceRole,
}: DeleteWorkspacePanelProps) {
  const router = useRouter();
  const workspaces = useWorkspaces();
  const remove = useDeleteWorkspace();
  const clearAuth = useAuthStore((s) => s.clear);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (workspaceRole !== 'OWNER') return null;

  const matches = typedName.trim() === workspaceName;

  const doDelete = () => {
    if (!matches) return;
    setError(null);
    remove.mutate(workspaceSlug, {
      onSuccess: () => {
        // Pick another workspace excluding the one we just deleted.
        // useDeleteWorkspace invalidated + removed cache entries; the
        // pre-delete list is still the authoritative "what else I had".
        const others = (workspaces.data ?? []).filter((w) => w.slug !== workspaceSlug);
        setConfirmOpen(false);
        setTypedName('');
        if (others.length > 0) {
          const next = others[0];
          useAuthStore.setState({
            workspace: { id: next.id, slug: next.slug, name: next.name },
          });
          router.push(`/w/${next.slug}/tasks`);
        } else {
          // Very rare — user just nuked their only workspace. Sign them
          // out defensively so they land on /login and can start fresh.
          clearAuth();
          window.location.href = '/login';
        }
      },
      onError: (err) => {
        setError(extractErrorMessage(err, 'Failed to delete workspace'));
      },
    });
  };

  return (
    <>
      <section className="rounded-lg border border-destructive/40 bg-card">
        <header className="border-b border-destructive/30 px-4 py-3">
          <h2 className="text-sm font-semibold text-destructive">Delete workspace</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Permanently deletes <span className="font-medium">{workspaceName}</span> and everything
            inside it — projects, tasks, comments, files, members. There is no undo.
          </p>
        </header>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            Only the owner can delete a workspace. Members and admins can leave; only you can remove
            the workspace itself.
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            className="sm:ml-auto"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete workspace
          </Button>
        </div>
      </section>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!next) {
            setError(null);
            setTypedName('');
          }
          setConfirmOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {workspaceName}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              This deletes <span className="font-semibold">everything</span> in this workspace —
              every project, every task, every comment, every uploaded file. Members lose access
              instantly. There is no recovery.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-workspace-name" className="text-xs">
                Type <span className="font-mono font-semibold">{workspaceName}</span> to confirm:
              </Label>
              <Input
                id="confirm-workspace-name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                autoFocus
                autoComplete="off"
                disabled={remove.isPending}
                aria-invalid={typedName.length > 0 && !matches}
              />
            </div>
            {error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={remove.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={doDelete}
              disabled={!matches || remove.isPending}
            >
              {remove.isPending ? 'Deleting…' : `Delete ${workspaceName}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
