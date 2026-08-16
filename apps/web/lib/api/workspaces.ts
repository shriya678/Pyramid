import { api } from '../api';
import type { Role } from './types';

export interface WorkspaceListItem {
  id: string;
  slug: string;
  name: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

/** All workspaces the current user is a member of, joined-desc. */
export async function listWorkspaces(): Promise<WorkspaceListItem[]> {
  const { data } = await api.get<WorkspaceListItem[]>('/workspaces');
  return data;
}

export interface CreateWorkspaceInput {
  name: string;
}

/**
 * Create a new workspace. Caller becomes OWNER; server provisions default
 * statuses only — no demo seed (see backend WorkspaceProvisioningService).
 */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceListItem> {
  const { data } = await api.post<WorkspaceListItem>('/workspaces', input);
  return data;
}

/**
 * Self-service leave. Backend blocks the sole OWNER (400); other members
 * succeed and have their ProjectMember rows in this workspace cascaded.
 */
export async function leaveWorkspace(slug: string): Promise<{ ok: true }> {
  const { data } = await api.post<{ ok: true }>(`/workspaces/${slug}/leave`);
  return data;
}

/**
 * Permanently delete a workspace and all its data. OWNER only. Backend
 * cascades through every workspace-scoped row via Prisma's `onDelete: Cascade`.
 * Irreversible.
 */
export async function deleteWorkspace(slug: string): Promise<{ ok: true }> {
  const { data } = await api.delete<{ ok: true }>(`/workspaces/${slug}`);
  return data;
}
