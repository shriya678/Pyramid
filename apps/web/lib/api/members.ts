import { api } from '../api';
import type { WorkspaceMemberResponse } from './types';

export async function listWorkspaceMembers(slug: string): Promise<WorkspaceMemberResponse[]> {
  const { data } = await api.get<WorkspaceMemberResponse[]>(`/workspaces/${slug}/members`);
  return data;
}
