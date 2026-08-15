import { api } from '../api';
import type { ActivityResponse } from './types';

export async function listActivity(slug: string, taskId: string): Promise<ActivityResponse[]> {
  const { data } = await api.get<ActivityResponse[]>(
    `/workspaces/${slug}/tasks/${taskId}/activity`,
  );
  return data;
}
