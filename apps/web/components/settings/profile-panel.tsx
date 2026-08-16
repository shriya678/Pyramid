'use client';

import { useState, type FormEvent } from 'react';
import { AxiosError } from 'axios';
import { Pencil } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateMe } from '@/lib/hooks/use-workspaces';
import { useAuthStore, type AuthUser } from '@/lib/stores/auth-store';

/**
 * Profile card. Read-only by default: displays name, username, email,
 * title, avatar. Click "Edit" to flip every field to an input; Save
 * PATCHes /auth/me and closes edit mode; Cancel restores the original
 * values.
 *
 * All validation happens server-side (username regex, uniqueness, URL
 * format, length caps) — errors are surfaced inline. That means we don't
 * spam the server with 409s while the user types a username.
 *
 * Email is displayed but never editable here; changing email would require
 * a re-verification flow that isn't in scope for this project.
 */
export function ProfilePanel() {
  const user = useAuthStore((s) => s.user);
  const update = useUpdateMe();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AuthUser | null>(user);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const startEdit = () => {
    setDraft(user);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
    setDraft(user);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const changes: Parameters<typeof update.mutate>[0] = {};
    if (draft.fullName.trim() !== user.fullName) changes.fullName = draft.fullName.trim();
    if (draft.username !== user.username) changes.username = draft.username;
    if ((draft.title ?? null) !== (user.title ?? null)) {
      // Empty string is treated as "clear" — send null so the backend
      // actually removes the value rather than storing "".
      changes.title = draft.title?.trim() ? draft.title.trim() : null;
    }
    if ((draft.avatarUrl ?? null) !== (user.avatarUrl ?? null)) {
      changes.avatarUrl = draft.avatarUrl?.trim() ? draft.avatarUrl.trim() : null;
    }
    if (Object.keys(changes).length === 0) {
      setEditing(false);
      return;
    }
    setError(null);
    update.mutate(changes, {
      onSuccess: () => {
        setEditing(false);
      },
      onError: (err) => {
        const message =
          err instanceof AxiosError
            ? // Backend 400s (class-validator) return an array; a single
              // string reads better inline.
              ((Array.isArray(err.response?.data?.message)
                ? err.response.data.message[0]
                : err.response?.data?.message) ?? err.message)
            : err instanceof Error
              ? err.message
              : 'Failed to update profile';
        setError(String(message));
      },
    });
  };

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Profile</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            How you appear across every workspace.
          </p>
        </div>
        {!editing ? (
          <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={startEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
        ) : null}
      </header>

      {!editing ? (
        <div className="flex items-start gap-4 p-4">
          <Avatar className="h-16 w-16 shrink-0">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.fullName} /> : null}
            <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1.5 text-sm">
            <Row label="Name" value={user.fullName} />
            <Row label="Username" value={`@${user.username}`} />
            <Row label="Email" value={user.email} />
            <Row
              label="Title"
              value={user.title ?? <span className="text-muted-foreground">—</span>}
            />
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup id="edit-fullname" label="Name">
              <Input
                id="edit-fullname"
                value={draft?.fullName ?? ''}
                onChange={(e) => setDraft((d) => (d ? { ...d, fullName: e.target.value } : d))}
                maxLength={80}
                required
                disabled={update.isPending}
              />
            </FieldGroup>
            <FieldGroup id="edit-username" label="Username">
              <Input
                id="edit-username"
                value={draft?.username ?? ''}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, username: e.target.value.toLowerCase() } : d))
                }
                minLength={2}
                maxLength={30}
                pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
                required
                disabled={update.isPending}
              />
            </FieldGroup>
            <FieldGroup id="edit-title" label="Title" className="sm:col-span-2">
              <Input
                id="edit-title"
                value={draft?.title ?? ''}
                onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
                maxLength={60}
                placeholder="e.g. Product Designer"
                disabled={update.isPending}
              />
            </FieldGroup>
            <FieldGroup id="edit-avatar" label="Avatar URL" className="sm:col-span-2">
              <Input
                id="edit-avatar"
                type="url"
                value={draft?.avatarUrl ?? ''}
                onChange={(e) => setDraft((d) => (d ? { ...d, avatarUrl: e.target.value } : d))}
                maxLength={500}
                placeholder="https://…"
                disabled={update.isPending}
              />
            </FieldGroup>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Email ({user.email}) can&apos;t be edited here.
          </div>
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={cancel} disabled={update.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate">{value}</span>
    </div>
  );
}

function FieldGroup({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
