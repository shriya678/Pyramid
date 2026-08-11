import type { Role } from '@prisma/client';

/** Nested user info returned in every project-member response. */
export interface ProjectMemberUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  isSeeded: boolean;
}

/** Public shape returned by the project-members endpoints. */
export interface ProjectMemberResponse {
  projectId: string;
  userId: string;
  addedById: string;
  addedAt: string;
  workspaceRole: Role;
  user: ProjectMemberUser;
}

/**
 * Response for the add endpoint. When the invitee already has full workspace
 * access (OWNER/ADMIN/MEMBER), no ProjectMember row is inserted and the
 * response signals `alreadyHasAccess: true` so the client can render a
 * friendly notice instead of a duplicate-error toast.
 */
export type AddProjectMemberResult =
  | { alreadyHasAccess: true; workspaceRole: Role; user: ProjectMemberUser }
  | { alreadyHasAccess: false; member: ProjectMemberResponse; implicitWorkspaceAdd: boolean };
