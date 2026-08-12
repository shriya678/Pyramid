import { api } from '../api';
import type { WorkspaceMemberResponse } from './types';

export async function listWorkspaceMembers(slug: string): Promise<WorkspaceMemberResponse[]> {
  const { data } = await api.get<WorkspaceMemberResponse[]>(`/workspaces/${slug}/members`);
  return data;
}

export interface AddWorkspaceMemberInput {
  email: string;
  role: 'MEMBER' | 'ADMIN';
}

export async function addWorkspaceMember(
  slug: string,
  input: AddWorkspaceMemberInput,
): Promise<WorkspaceMemberResponse> {
  const { data } = await api.post<WorkspaceMemberResponse>(`/workspaces/${slug}/members`, input);
  return data;
}

export async function removeWorkspaceMember(slug: string, userId: string): Promise<{ ok: true }> {
  const { data } = await api.delete<{ ok: true }>(`/workspaces/${slug}/members/${userId}`);
  return data;
}
