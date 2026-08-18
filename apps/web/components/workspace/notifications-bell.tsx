'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/lib/hooks/use-notifications';
import type { NotificationResponse } from '@/lib/api/notifications';

/**
 * Bell icon + unread badge in the workspace top bar. Click opens a popover
 * with recent notifications; each row navigates to the mentioned task and
 * marks that notification read on the way.
 *
 * Polling: the unread-count query runs on a 30s interval so a fresh mention
 * shows up without a page refresh. The full list only refetches when the
 * popover is open — most users have zero unread, no need to pull 50 rows
 * every poll.
 */
export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = useUnreadNotificationCount();
  const list = useNotifications(open); // enabled only when popover is open
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unreadCount = unread.data?.count ?? 0;
  const notifications = list.data ?? [];
  const anyUnread = notifications.some((n) => n.readAt === null);

  const openNotification = (n: NotificationResponse) => {
    // Mark read regardless of nav outcome — fire-and-forget.
    if (!n.readAt) markRead.mutate(n.id);
    if (!n.task) {
      setOpen(false);
      return;
    }
    setOpen(false);
    router.push(`/w/${n.task.workspaceSlug}/t/${n.task.id}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0" sideOffset={8}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {anyUnread ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {list.isLoading ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</p>
          ) : notifications.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Bell className="mx-auto h-6 w-6 text-muted-foreground/40" />
              <p className="mt-2 text-xs text-muted-foreground">
                No notifications yet. When someone @mentions you in a comment, it&apos;ll show up
                here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <NotificationRow key={n.id} n={n} onClick={() => openNotification(n)} />
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({ n, onClick }: { n: NotificationResponse; onClick: () => void }) {
  const isUnread = n.readAt === null;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent',
          isUnread && 'bg-primary/5',
        )}
      >
        <Avatar className="mt-0.5 h-8 w-8 shrink-0">
          {n.actor.avatarUrl ? (
            <AvatarImage src={n.actor.avatarUrl} alt={n.actor.fullName} />
          ) : null}
          <AvatarFallback className="text-[10px]">{initials(n.actor.fullName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-xs">
            <span className="font-medium">{n.actor.fullName}</span>{' '}
            <span className="text-muted-foreground">mentioned you</span>
            {n.task ? (
              <>
                {' '}
                <span className="text-muted-foreground">in</span>{' '}
                <span className="font-medium">{n.task.title}</span>
              </>
            ) : null}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{formatRelative(n.createdAt)}</p>
        </div>
        {isUnread ? (
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            aria-label="Unread"
          />
        ) : null}
      </button>
    </li>
  );
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}
