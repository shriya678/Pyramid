import { api } from '../api';
import type { StatusResponse } from './types';

export async function listStatuses(slug: string): Promise<StatusResponse[]> {
  const { data } = await api.get<StatusResponse[]>(`/workspaces/${slug}/statuses`);
  return data;
}
