// Response types mirrored from apps/api/src/modules/**/*.service.ts. Keep in
// sync manually — we don't yet share types via a package. If a mismatch is
// discovered, the fix goes here (not in the API).

export type Priority = 'NONE' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'COLLABORATOR';

export interface StatusResponse {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  order: number;
  createdAt: string;
}

export interface LabelResponse {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface TaskAssigneeMini {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface TaskLabelMini {
  id: string;
  name: string;
  color: string;
}

export interface TaskResponse {
  id: string;
  workspaceId: string;
  projectId: string | null;
  parentTaskId: string | null;
  statusId: string;
  title: string;
  description: string | null;
  priority: Priority;
  reporterId: string;
  startDate: string | null;
  dueDate: string | null;
  orderInColumn: number;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssigneeMini[];
  labels: TaskLabelMini[];
  subtaskCount: number;
}

export interface WorkspaceMemberResponse {
  workspaceId: string;
  userId: string;
  role: Role;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    fullName: string;
    avatarUrl: string | null;
    isGuest: boolean;
    isSeeded: boolean;
  };
}
