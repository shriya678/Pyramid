'use client';

import {
  AtSign,
  CircleDot,
  CalendarDays,
  Flag,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Tag,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ActivityResponse, ActivityType } from '@/lib/api/types';
import {
  useActivity,
  useStatuses,
  useWorkspaceMembers,
  useLabels,
} from '@/lib/hooks/use-board-data';

export interface ActivityFeedProps {
  workspaceSlug: string;
  taskId: string;
}

/**
 * Read-only activity feed for a task. Backend writes an Activity row in the
 * same transaction as each mutation (task update, comment, resource, member
 * add/remove, etc.). We render each row as a one-line entry with a typed
 * icon + the actor + a human-readable summary.
 *
 * The payload shape differs per ActivityType (jsonb column server-side).
 * `describe()` handles each type it knows about; unknown types fall back
 * to the raw enum name so we never crash on new event types.
 */
export function ActivityFeed({ workspaceSlug, taskId }: ActivityFeedProps) {
  const activity = useActivity(workspaceSlug, taskId);
  // Lookups so payload ids can be shown as human names.
  const statuses = useStatuses(workspaceSlug);
  const members = useWorkspaceMembers(workspaceSlug);
  const labels = useLabels(workspaceSlug);

  const statusNameById = new Map((statuses.data ?? []).map((s) => [s.id, s.name]));
  const memberNameById = new Map((members.data ?? []).map((m) => [m.userId, m.user.fullName]));
  const labelNameById = new Map((labels.data ?? []).map((l) => [l.id, l.name]));

  return (
    <section className="space-y-3">
      <header className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Activity</h3>
        <span className="text-xs text-muted-foreground">{activity.data?.length ?? 0}</span>
      </header>

      {activity.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : activity.error ? (
        <p className="text-xs text-muted-foreground">Failed to load activity.</p>
      ) : (activity.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {(activity.data ?? []).map((a) => (
            <ActivityRow
              key={a.id}
              activity={a}
              lookups={{ statusNameById, memberNameById, labelNameById }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface Lookups {
  statusNameById: Map<string, string>;
  memberNameById: Map<string, string>;
  labelNameById: Map<string, string>;
}

function ActivityRow({ activity, lookups }: { activity: ActivityResponse; lookups: Lookups }) {
  const summary = describe(activity, lookups);
  return (
    <li className="flex items-start gap-2 text-xs">
      <Avatar className="h-5 w-5 shrink-0">
        {activity.actor.avatarUrl ? (
          <AvatarImage src={activity.actor.avatarUrl} alt={activity.actor.fullName} />
        ) : null}
        <AvatarFallback className="text-[9px]">{initials(activity.actor.fullName)}</AvatarFallback>
      </Avatar>
      <ActivityIcon type={activity.type} />
      <p className="min-w-0 flex-1 leading-tight">
        <span className="font-medium">{activity.actor.fullName}</span>{' '}
        <span className="text-muted-foreground">{summary}</span>{' '}
        <span className="text-[10px] text-muted-foreground/70">
          · {formatRelative(activity.createdAt)}
        </span>
      </p>
    </li>
  );
}

/** Icon selection as JSX rather than a variable-holds-a-component pattern —
 *  React 19's compiler flags the latter as "Cannot create components during
 *  render" even when the referenced component is stable. */
function ActivityIcon({ type }: { type: ActivityType }) {
  const cls = 'mt-0.5 h-3 w-3 shrink-0 text-muted-foreground';
  switch (type) {
    case 'TASK_CREATED':
      return <Plus className={cls} />;
    case 'STATUS_CHANGED':
      return <CircleDot className={cls} />;
    case 'PRIORITY_CHANGED':
      return <Flag className={cls} />;
    case 'DUE_DATE_CHANGED':
      return <CalendarDays className={cls} />;
    case 'MEMBER_ADDED':
      return <UserPlus className={cls} />;
    case 'MEMBER_REMOVED':
      return <UserMinus className={cls} />;
    case 'LABEL_ADDED':
    case 'LABEL_REMOVED':
      return <Tag className={cls} />;
    case 'COMMENT_ADDED':
      return <MessageSquare className={cls} />;
    case 'RESOURCE_ADDED':
      return <Paperclip className={cls} />;
    case 'USER_UPDATE':
      return <AtSign className={cls} />;
    case 'TASK_UPDATED':
    default:
      return <Pencil className={cls} />;
  }
}

function describe(a: ActivityResponse, lookups: Lookups): string {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  switch (a.type) {
    case 'TASK_CREATED':
      return `created this task`;
    case 'STATUS_CHANGED': {
      const before = lookups.statusNameById.get(String(p.before ?? '')) ?? 'a column';
      const after = lookups.statusNameById.get(String(p.after ?? '')) ?? 'a column';
      return `moved from ${before} to ${after}`;
    }
    case 'PRIORITY_CHANGED':
      return `changed priority ${p.before ?? '?'} → ${p.after ?? '?'}`;
    case 'DUE_DATE_CHANGED': {
      const before = p.before ? new Date(String(p.before)).toLocaleDateString() : 'none';
      const after = p.after ? new Date(String(p.after)).toLocaleDateString() : 'none';
      return `changed due date ${before} → ${after}`;
    }
    case 'MEMBER_ADDED': {
      const name = lookups.memberNameById.get(String(p.userId ?? '')) ?? 'someone';
      return `assigned ${name}`;
    }
    case 'MEMBER_REMOVED': {
      const name = lookups.memberNameById.get(String(p.userId ?? '')) ?? 'someone';
      return `unassigned ${name}`;
    }
    case 'LABEL_ADDED': {
      const name = lookups.labelNameById.get(String(p.labelId ?? '')) ?? 'a label';
      return `added label ${name}`;
    }
    case 'LABEL_REMOVED': {
      const name = lookups.labelNameById.get(String(p.labelId ?? '')) ?? 'a label';
      return `removed label ${name}`;
    }
    case 'COMMENT_ADDED':
      return p.isReply ? 'replied to a comment' : 'commented';
    case 'RESOURCE_ADDED':
      return `added ${String(p.type ?? 'a resource').toLowerCase()}`;
    case 'TASK_UPDATED':
      // Payload can have title/description sub-diffs — keep the summary
      // generic to avoid render churn on every keystroke's autosave.
      if (p.title) return `renamed the task`;
      if (p.description) return `updated the description`;
      return `updated the task`;
    case 'USER_UPDATE':
    default:
      return a.type.toLowerCase().replace(/_/g, ' ');
  }
}

function initials(text: string): string {
  const parts = text.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function formatRelative(iso: string): string {
  const nowMs = Date.now();
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
