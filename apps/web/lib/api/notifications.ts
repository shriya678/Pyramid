import { api } from '../api';

export type NotificationType = 'MENTION';

export interface NotificationActorMini {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface NotificationTaskMini {
  id: string;
  title: string;
  workspaceSlug: string;
}

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  actor: NotificationActorMini;
  task: NotificationTaskMini | null;
  commentId: string | null;
  readAt: string | null;
  createdAt: string;
}

export async function listNotifications(limit = 50): Promise<NotificationResponse[]> {
  const { data } = await api.get<NotificationResponse[]>('/notifications', {
    params: { limit },
  });
  return data;
}

export async function getUnreadCount(): Promise<{ count: number }> {
  const { data } = await api.get<{ count: number }>('/notifications/unread-count');
  return data;
}

export async function markNotificationRead(id: string): Promise<{ ok: true }> {
  const { data } = await api.patch<{ ok: true }>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<{ ok: true; updated: number }> {
  const { data } = await api.post<{ ok: true; updated: number }>('/notifications/mark-all-read');
  return data;
}
