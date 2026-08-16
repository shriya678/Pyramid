'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLeaveWorkspace, useWorkspaces } from '@/lib/hooks/use-workspaces';
import { useWorkspaceMembers } from '@/lib/hooks/use-board-data';
import { useAuthStore } from '@/lib/stores/auth-store';
import type { Role } from '@/lib/api/types';

export interface LeaveWorkspacePanelProps {
  workspaceSlug: string;
  workspaceName: string;
  workspaceRole: Role;
}

/**
 * Destructive "Leave workspace" section. Backend enforces the real rules
 * (blocks the sole OWNER with a 400); this UI mirrors them so the block
 * is clear before the user clicks anything they can't undo.
 *
 * On successful leave:
 *   - The workspaces list refetches (invalidated by useLeaveWorkspace).
 *   - The auth store's workspace is swapped to another one the user still
 *     belongs to, and the router navigates there.
 *   - If the user has no other workspaces left (edge case — a guest
 *     wouldn't be here in the first place), we sign them out.
 */
export function LeaveWorkspacePanel({
  workspaceSlug,
  workspaceName,
  workspaceRole,
}: LeaveWorkspacePanelProps) {
  const router = useRouter();
  const workspaces = useWorkspaces();
  const members = useWorkspaceMembers(workspaceSlug);
  const leave = useLeaveWorkspace();
  const clearAuth = useAuthStore((s) => s.clear);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerCount = members.data?.filter((m) => m.role === 'OWNER').length ?? null;
  const isSoleOwner = workspaceRole === 'OWNER' && ownerCount === 1;

  const doLeave = () => {
    setError(null);
    leave.mutate(workspaceSlug, {
      onSuccess: () => {
        // Pick another workspace to land on, excluding this one. The
        // useLeaveWorkspace hook invalidated the list, but that refetch
        // hasn't landed yet — use the pre-leave list which is still
        // authoritative for "what else did I belong to before".
        const others = (workspaces.data ?? []).filter((w) => w.slug !== workspaceSlug);
        setConfirmOpen(false);
        if (others.length > 0) {
          const next = others[0];
          useAuthStore.setState({
            workspace: { id: next.id, slug: next.slug, name: next.name },
          });
          router.push(`/w/${next.slug}/tasks`);
        } else {
          // Shouldn't happen in practice (a real user always keeps at
          // least their own workspace where they're OWNER, and would be
          // blocked from leaving that). Defensive: sign them out.
          clearAuth();
          window.location.href = '/login';
        }
      },
      onError: (err) => {
        const message =
          err instanceof AxiosError
            ? ((Array.isArray(err.response?.data?.message)
                ? err.response.data.message[0]
                : err.response?.data?.message) ?? err.message)
            : err instanceof Error
              ? err.message
              : 'Failed to leave workspace';
        setError(String(message));
      },
    });
  };

  return (
    <>
      <section className="rounded-lg border border-destructive/30 bg-card">
        <header className="border-b border-destructive/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-destructive">Leave workspace</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Removes your access to <span className="font-medium">{workspaceName}</span>. Your
            projects and tasks stay; you can be re-invited later.
          </p>
        </header>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {members.isLoading ? (
              'Checking membership…'
            ) : isSoleOwner ? (
              <>
                You&apos;re the sole owner. Transfer ownership before leaving, or delete the
                workspace instead.{' '}
                <span className="italic">(Delete-workspace ships in a follow-up.)</span>
              </>
            ) : (
              'This is a soft leave — no data is deleted.'
            )}
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={isSoleOwner || members.isLoading}
            className="sm:ml-auto"
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Leave workspace
          </Button>
        </div>
      </section>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!next) setError(null);
          setConfirmOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave {workspaceName}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              You&apos;ll lose access to every project and task in this workspace. If you&apos;re
              re-invited later, your account picks up where it left off — nothing you created gets
              deleted.
            </p>
            {workspaceRole === 'COLLABORATOR' ? (
              <p className="text-xs text-muted-foreground">
                Your project-level memberships in this workspace will also be removed.
              </p>
            ) : null}
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
              disabled={leave.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={doLeave}
              disabled={leave.isPending}
            >
              {leave.isPending ? 'Leaving…' : `Leave ${workspaceName}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
