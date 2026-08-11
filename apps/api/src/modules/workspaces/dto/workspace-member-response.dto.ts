import type { Role } from '@prisma/client';

/** Nested user info returned in every workspace-member response. */
export interface WorkspaceMemberUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  isSeeded: boolean;
}

/** Public shape returned by all workspace-member endpoints. */
export interface WorkspaceMemberResponse {
  workspaceId: string;
  userId: string;
  role: Role;
  joinedAt: string;
  user: WorkspaceMemberUser;
}
