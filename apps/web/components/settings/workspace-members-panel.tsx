'use client';

import { useState, type FormEvent } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { extractErrorMessage } from '@/lib/api/error-message';
import type { Role, WorkspaceMemberResponse } from '@/lib/api/types';
import {
  useAddWorkspaceMember,
  useRemoveWorkspaceMember,
  useWorkspaceMembers,
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

export interface WorkspaceMembersPanelProps {
  workspaceSlug: string;
  workspaceRole: Role;
  currentUserId: string;
}

/**
 * Workspace-level Members panel for the Settings screen. Same shape as
 * ProjectMembersPanel but role picker (MEMBER / ADMIN) is exposed on the
 * add form, and remove is available for anyone-but-yourself who isn't the
 * sole OWNER (server enforces both; UI only pre-hides self-remove to save
 * a round-trip on an obvious footgun).
 */
export function WorkspaceMembersPanel({
  workspaceSlug,
  workspaceRole,
  currentUserId,
}: WorkspaceMembersPanelProps) {
  const members = useWorkspaceMembers(workspaceSlug);
  const add = useAddWorkspaceMember(workspaceSlug);
  const remove = useRemoveWorkspaceMember(workspaceSlug);
  const canManage = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError(null);
    setNotice(null);
    add.mutate(
      { email: trimmed, role },
      {
        onSuccess: (added) => {
          setEmail('');
          setNotice(`${added.user.fullName} added as ${ROLE_LABEL[added.role]} of the workspace.`);
        },
        onError: (err) => {
          setError(extractErrorMessage(err, 'Failed to add member'));
        },
      },
    );
  };

  return (
    <section className="rounded-lg border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Workspace members</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Everyone in this workspace. Add real users by email — they must already have signed up.
          Collaborators appear here when added to specific projects.
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
            <Select
              value={role}
              onValueChange={(v) => {
                if (v === 'MEMBER' || v === 'ADMIN') setRole(v);
              }}
            >
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
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
        ) : (
          (members.data ?? []).map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              canRemove={canManage && m.userId !== currentUserId}
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
  member: WorkspaceMemberResponse;
  canRemove: boolean;
  onRemove: () => void;
  isRemoving: boolean;
}

function MemberRow({ member, canRemove, onRemove, isRemoving }: MemberRowProps) {
  const { user, role } = member;
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
          ROLE_CHIP[role],
        )}
      >
        {ROLE_LABEL[role]}
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
