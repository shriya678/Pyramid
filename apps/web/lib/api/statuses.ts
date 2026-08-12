import { api } from '../api';
import type { StatusResponse } from './types';

export async function listStatuses(slug: string): Promise<StatusResponse[]> {
  const { data } = await api.get<StatusResponse[]>(`/workspaces/${slug}/statuses`);
  return data;
}

export interface UpdateStatusInput {
  name?: string;
  color?: string;
  order?: number;
}

export async function updateStatus(
  slug: string,
  statusId: string,
  input: UpdateStatusInput,
): Promise<StatusResponse> {
  const { data } = await api.patch<StatusResponse>(
    `/workspaces/${slug}/statuses/${statusId}`,
    input,
  );
  return data;
}
