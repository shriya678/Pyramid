'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/notifications';

/**
 * Query keys. User-scoped, not workspace-scoped — a MENTION is delivered to
 * a user across every workspace they participate in.
 */
export const notificationsKeys = {
  list: ['notifications', 'list'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

/**
 * The recent notifications list. Only fetched when a caller subscribes
 * (i.e. the bell popover is open) — outside of that, we lean on the
 * cheaper unread-count poll.
 */
export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: notificationsKeys.list,
    queryFn: () => listNotifications(50),
    enabled,
    staleTime: 15_000,
  });
}

/**
 * Unread count for the bell badge. Polled every 30s so a new mention shows
 * up without needing a page refresh.
 *
 * We intentionally do NOT poll the full list — most users have zero unread,
 * and the count query is a single indexed COUNT(*). Cheaper than pulling
 * 50 rows every 30s.
 */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationsKeys.unreadCount,
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationsKeys.list });
      void qc.invalidateQueries({ queryKey: notificationsKeys.unreadCount });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationsKeys.list });
      void qc.invalidateQueries({ queryKey: notificationsKeys.unreadCount });
    },
  });
}
