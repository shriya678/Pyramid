import { api } from '../api';
import type { Priority, ProjectResponse } from './types';

export interface CreateProjectInput {
  name: string;
  description?: string;
  priority?: Priority;
  leadUserId?: string | null;
  dueDate?: string | null;
  orderIndex?: number;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  priority?: Priority;
  leadUserId?: string | null;
  dueDate?: string | null;
  orderIndex?: number;
}

export async function listProjects(slug: string): Promise<ProjectResponse[]> {
  const { data } = await api.get<ProjectResponse[]>(`/workspaces/${slug}/projects`);
  return data;
}

export async function getProject(slug: string, projectId: string): Promise<ProjectResponse> {
  const { data } = await api.get<ProjectResponse>(`/workspaces/${slug}/projects/${projectId}`);
  return data;
}

export async function createProject(
  slug: string,
  input: CreateProjectInput,
): Promise<ProjectResponse> {
  const { data } = await api.post<ProjectResponse>(`/workspaces/${slug}/projects`, input);
  return data;
}

export async function updateProject(
  slug: string,
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectResponse> {
  const { data } = await api.patch<ProjectResponse>(
    `/workspaces/${slug}/projects/${projectId}`,
    input,
  );
  return data;
}

export async function deleteProject(slug: string, projectId: string): Promise<{ ok: true }> {
  const { data } = await api.delete<{ ok: true }>(`/workspaces/${slug}/projects/${projectId}`);
  return data;
}
