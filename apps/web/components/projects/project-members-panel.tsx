'use client';

import { useState, type FormEvent } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ProjectMemberResponse, Role } from '@/lib/api/types';
import {
  useAddProjectMember,
  useProjectMembers,
  useRemoveProjectMember,
} from '@/lib/hooks/use-board-data';

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  COLLABORATOR: 'Collaborator',
};
const ROLE_CHIP: Record<Role, string> = {
  OWNER: 'bg-primary/15 text-primary',
  ADMIN: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  MEMBER: 'bg-muted text-foreground/70',
  COLLABORATOR: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

export interface ProjectMembersPanelProps {
  workspaceSlug: string;
  projectId: string;
  /** The current user's role in the workspace — gates add/remove controls. */
  workspaceRole: Role;
  /** The current user's id — used to hide the "remove yourself" button. */
  currentUserId: string;
}

/**
 * List of every user who can see this project, plus an add-by-email form
 * for OWNER/ADMIN. Row semantics:
 *   - OWNER/ADMIN/MEMBER rows show the role chip only (no remove button —
 *     they see the project via the workspace tier and removing is done
 *     from the Workspace Members panel).
 *   - COLLABORATOR rows show a Remove button (visible to OWNER/ADMIN only)
 *     that drops the ProjectMember row without touching workspace membership.
 */
export function ProjectMembersPanel({
  workspaceSlug,
  projectId,
  workspaceRole,
  currentUserId,
}: ProjectMembersPanelProps) {
  const members = useProjectMembers(workspaceSlug, projectId);
  const add = useAddProjectMember(workspaceSlug, projectId);
  const remove = useRemoveProjectMember(workspaceSlug, projectId);
  const canManage = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError(null);
    setNotice(null);
    add.mutate(trimmed, {
      onSuccess: (result) => {
        setEmail('');
        if (result.alreadyHasAccess) {
          setNotice(
            `${result.user.fullName} already has ${ROLE_LABEL[result.workspaceRole]} access — no change made.`,
          );
        } else if (result.implicitWorkspaceAdd) {
          setNotice(`${result.member.user.fullName} added as a Collaborator on this project.`);
        } else {
          setNotice(`${result.member.user.fullName} added to this project.`);
        }
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Failed to add member');
      },
    });
  };

  return (
    <section className="rounded-lg border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Members</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Anyone with access to this project. Workspace admins are always here; collaborators are
          added by email.
        </p>
      </header>

      {canManage ? (
        <form onSubmit={submit} className="border-b px-4 py-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <UserPlus className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Add a member by email"
                className="h-8 pl-7 text-sm"
                aria-label="Member email"
                disabled={add.isPending}
              />
            </div>
            <Button type="submit" size="sm" disabled={add.isPending || !email.trim()}>
              {add.isPending ? 'Adding…' : 'Add'}
            </Button>
          </div>
          {error ? (
            <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="mt-2 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">{notice}</p>
          ) : null}
        </form>
      ) : null}

      <ul className="divide-y">
        {members.isLoading ? (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</li>
        ) : members.error ? (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">
            Failed to load members.
          </li>
        ) : (members.data ?? []).length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">No members yet.</li>
        ) : (
          (members.data ?? []).map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              canRemove={
                canManage && m.userId !== currentUserId && m.workspaceRole === 'COLLABORATOR'
              }
              onRemove={() => remove.mutate(m.userId)}
              isRemoving={remove.isPending && remove.variables === m.userId}
            />
          ))
        )}
      </ul>
    </section>
  );
}

interface MemberRowProps {
  member: ProjectMemberResponse;
  canRemove: boolean;
  onRemove: () => void;
  isRemoving: boolean;
}

function MemberRow({ member, canRemove, onRemove, isRemoving }: MemberRowProps) {
  const { user, workspaceRole } = member;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Avatar className="h-8 w-8 shrink-0">
        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.fullName} /> : null}
        <AvatarFallback className="text-[11px]">{initials(user.fullName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.fullName}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <span
        className={cn(
          'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
          ROLE_CHIP[workspaceRole],
        )}
      >
        {ROLE_LABEL[workspaceRole]}
      </span>
      {canRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={isRemoving}
          aria-label={`Remove ${user.fullName}`}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      ) : null}
    </li>
  );
}

function initials(text: string): string {
  const parts = text.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
