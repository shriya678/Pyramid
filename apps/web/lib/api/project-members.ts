import { api } from '../api';
import type { AddProjectMemberResult, ProjectMemberResponse } from './types';

export async function listProjectMembers(
  slug: string,
  projectId: string,
): Promise<ProjectMemberResponse[]> {
  const { data } = await api.get<ProjectMemberResponse[]>(
    `/workspaces/${slug}/projects/${projectId}/members`,
  );
  return data;
}

export async function addProjectMember(
  slug: string,
  projectId: string,
  email: string,
): Promise<AddProjectMemberResult> {
  const { data } = await api.post<AddProjectMemberResult>(
    `/workspaces/${slug}/projects/${projectId}/members`,
    { email },
  );
  return data;
}

export async function removeProjectMember(
  slug: string,
  projectId: string,
  userId: string,
): Promise<{ ok: true }> {
  const { data } = await api.delete<{ ok: true }>(
    `/workspaces/${slug}/projects/${projectId}/members/${userId}`,
  );
  return data;
}
