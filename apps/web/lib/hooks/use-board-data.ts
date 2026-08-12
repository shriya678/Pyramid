'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listLabels } from '../api/labels';
import {
  addWorkspaceMember,
  listWorkspaceMembers,
  removeWorkspaceMember,
  type AddWorkspaceMemberInput,
} from '../api/members';
import { addProjectMember, listProjectMembers, removeProjectMember } from '../api/project-members';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '../api/projects';
import { listStatuses, updateStatus, type UpdateStatusInput } from '../api/statuses';
import type { ProjectResponse, StatusResponse, TaskResponse } from '../api/types';
import {
  createTask,
  listTasks,
  updateTask,
  type CreateTaskInput,
  type TaskListQuery,
  type UpdateTaskInput,
} from '../api/tasks';

/** Query-key factory. Keeping these centralised keeps invalidations honest. */
export const boardKeys = {
  statuses: (slug: string) => ['statuses', slug] as const,
  labels: (slug: string) => ['labels', slug] as const,
  members: (slug: string) => ['members', slug] as const,
  tasks: (slug: string, query: TaskListQuery) => ['tasks', slug, query] as const,
  projects: (slug: string) => ['projects', slug] as const,
  project: (slug: string, projectId: string) => ['project', slug, projectId] as const,
  projectMembers: (slug: string, projectId: string) =>
    ['project-members', slug, projectId] as const,
};

/** Workspace statuses (columns for the board). Ordered ascending by Status.order. */
export function useStatuses(slug: string) {
  return useQuery({
    queryKey: boardKeys.statuses(slug),
    queryFn: () => listStatuses(slug),
    enabled: Boolean(slug),
  });
}

/** Workspace labels — used by the filters popover + card chips. */
export function useLabels(slug: string) {
  return useQuery({
    queryKey: boardKeys.labels(slug),
    queryFn: () => listLabels(slug),
    enabled: Boolean(slug),
  });
}

/** Workspace members — used by filters and future assignee pickers. */
export function useWorkspaceMembers(slug: string) {
  return useQuery({
    queryKey: boardKeys.members(slug),
    queryFn: () => listWorkspaceMembers(slug),
    enabled: Boolean(slug),
  });
}

/**
 * Look up the current user's role in the workspace. Falls back to
 * `undefined` while the members list is still loading — callers that
 * gate UI on OWNER/ADMIN should treat undefined as "not yet permitted"
 * to avoid a flash of edit controls.
 */
export function useMyWorkspaceRole(slug: string, userId: string | undefined) {
  const members = useWorkspaceMembers(slug);
  if (!userId) return undefined;
  return members.data?.find((m) => m.userId === userId)?.role;
}

/**
 * Top-level tasks with optional filters. Board keys tasks by the full query
 * object so switching filters produces a fresh cache slot (and cheap
 * revisits back to already-seen filter combos).
 */
export function useTasks(slug: string, query: TaskListQuery = {}) {
  return useQuery({
    queryKey: boardKeys.tasks(slug, query),
    queryFn: () => listTasks(slug, query),
    enabled: Boolean(slug),
  });
}

/**
 * Quick-add — POST /tasks and invalidate every `tasks` query for this
 * workspace so all filter variants refetch.
 */
export function useCreateTask(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(slug, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', slug] });
    },
  });
}

/**
 * Optimistic task update — used by the board's drag-drop to move cards
 * between/within columns. Applies the patch to every cached `tasks` slot
 * for this workspace before the network call. On error the pre-mutation
 * cache is restored. `onSettled` DELIBERATELY does not invalidate — the
 * optimistic diff already equals the server's outcome for the fields we
 * touch (statusId / orderInColumn), so a refetch would just cause a flash
 * of the old order while React reconciles.
 */
export interface UpdateTaskVariables {
  taskId: string;
  input: UpdateTaskInput;
}

export function useUpdateTask(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, input }: UpdateTaskVariables) => updateTask(slug, taskId, input),
    onMutate: async ({ taskId, input }) => {
      // Cancel in-flight refetches so they don't overwrite our optimistic diff.
      await qc.cancelQueries({ queryKey: ['tasks', slug] });

      // Snapshot every 'tasks' query slot (there's one per unique filter
      // combo the user has visited). We restore all of them on error.
      const snapshot = qc.getQueriesData<TaskResponse[]>({ queryKey: ['tasks', slug] });

      qc.setQueriesData<TaskResponse[]>({ queryKey: ['tasks', slug] }, (old) => {
        if (!old) return old;
        return old.map((t) => (t.id === taskId ? { ...t, ...input } : t));
      });

      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, value] of ctx.snapshot) {
        qc.setQueryData(key, value);
      }
    },
  });
}

/**
 * Optimistic status reorder — same pattern as useUpdateTask but for the
 * single `statuses` cache slot. Used when the user drags a column header.
 */
export function useUpdateStatus(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ statusId, input }: { statusId: string; input: UpdateStatusInput }) =>
      updateStatus(slug, statusId, input),
    onMutate: async ({ statusId, input }) => {
      await qc.cancelQueries({ queryKey: boardKeys.statuses(slug) });
      const previous = qc.getQueryData<StatusResponse[]>(boardKeys.statuses(slug));
      qc.setQueryData<StatusResponse[]>(boardKeys.statuses(slug), (old) => {
        if (!old) return old;
        return old
          .map((s) => (s.id === statusId ? { ...s, ...input } : s))
          .sort((a, b) => a.order - b.order);
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.previous) return;
      qc.setQueryData(boardKeys.statuses(slug), ctx.previous);
    },
  });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function useProjects(slug: string) {
  return useQuery({
    queryKey: boardKeys.projects(slug),
    queryFn: () => listProjects(slug),
    enabled: Boolean(slug),
  });
}

export function useProject(slug: string, projectId: string | null | undefined) {
  return useQuery({
    queryKey: boardKeys.project(slug, projectId ?? ''),
    queryFn: () => getProject(slug, projectId!),
    enabled: Boolean(slug) && Boolean(projectId),
  });
}

/** Create a project + invalidate the workspace-scoped projects list. */
export function useCreateProject(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(slug, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.projects(slug) });
    },
  });
}

/** Update a project — invalidates both the single-project cache and the list. */
export function useUpdateProject(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => updateProject(slug, projectId, input),
    onSuccess: (updated) => {
      qc.setQueryData<ProjectResponse>(boardKeys.project(slug, projectId), updated);
      void qc.invalidateQueries({ queryKey: boardKeys.projects(slug) });
    },
  });
}

/** Delete a project. Also invalidates tasks (backend sets projectId=null on
 *  the project's tasks — they survive as orphans, so the tasks cache is now
 *  stale). */
export function useDeleteProject(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => deleteProject(slug, projectId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.projects(slug) });
      void qc.invalidateQueries({ queryKey: ['tasks', slug] });
    },
  });
}

// ---------------------------------------------------------------------------
// Project members
// ---------------------------------------------------------------------------

export function useProjectMembers(slug: string, projectId: string | null | undefined) {
  return useQuery({
    queryKey: boardKeys.projectMembers(slug, projectId ?? ''),
    queryFn: () => listProjectMembers(slug, projectId!),
    enabled: Boolean(slug) && Boolean(projectId),
  });
}

/** Add a project member. Invalidates the project's members list AND the
 *  workspace members list (a new COLLABORATOR may have been auto-created). */
export function useAddProjectMember(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => addProjectMember(slug, projectId, email),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.projectMembers(slug, projectId) });
      void qc.invalidateQueries({ queryKey: boardKeys.members(slug) });
    },
  });
}

export function useRemoveProjectMember(slug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeProjectMember(slug, projectId, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.projectMembers(slug, projectId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Workspace members (add / remove; the list hook already lives above as
// useWorkspaceMembers).
// ---------------------------------------------------------------------------

export function useAddWorkspaceMember(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddWorkspaceMemberInput) => addWorkspaceMember(slug, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.members(slug) });
    },
  });
}

export function useRemoveWorkspaceMember(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember(slug, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.members(slug) });
      // A removed member also lost their ProjectMember rows — invalidate any
      // project-members caches for this workspace so the roster refreshes.
      void qc.invalidateQueries({ queryKey: ['project-members', slug] });
    },
  });
}
