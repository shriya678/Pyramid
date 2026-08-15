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

export interface CreateStatusInput {
  name: string;
  color: string;
  order?: number;
}

export async function createStatus(
  slug: string,
  input: CreateStatusInput,
): Promise<StatusResponse> {
  const { data } = await api.post<StatusResponse>(`/workspaces/${slug}/statuses`, input);
  return data;
}

/**
 * Delete a status. Backend rules:
 *   - Returns 409 if it's the last status in the workspace.
 *   - Requires ?moveTo=<statusId> when tasks are attached; moved count
 *     comes back as `movedTasks`.
 *   - Otherwise the status is removed with movedTasks: 0.
 */
export async function deleteStatus(
  slug: string,
  statusId: string,
  moveTo?: string,
): Promise<{ ok: true; movedTasks: number }> {
  const { data } = await api.delete<{ ok: true; movedTasks: number }>(
    `/workspaces/${slug}/statuses/${statusId}`,
    { params: moveTo ? { moveTo } : undefined },
  );
  return data;
}
