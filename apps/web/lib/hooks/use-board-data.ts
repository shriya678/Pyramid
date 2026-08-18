'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listActivity } from '../api/activity';
import {
  createComment,
  deleteComment,
  listComments,
  updateComment,
  type CreateCommentInput,
} from '../api/comments';
import { createLabel, listLabels, type CreateLabelInput } from '../api/labels';
import {
  createResource,
  deleteResource,
  getResourceUrl,
  listResources,
  signUpload,
  type CreateResourceInput,
} from '../api/resources';
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
import {
  createStatus,
  deleteStatus,
  listStatuses,
  updateStatus,
  type CreateStatusInput,
  type UpdateStatusInput,
} from '../api/statuses';
import type { ProseMirrorDoc } from '../prosemirror-doc';
import type { ProjectResponse, StatusResponse, TaskResponse } from '../api/types';
import {
  createTask,
  deleteTask,
  getTask,
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
  task: (slug: string, taskId: string) => ['task', slug, taskId] as const,
  projects: (slug: string) => ['projects', slug] as const,
  project: (slug: string, projectId: string) => ['project', slug, projectId] as const,
  projectMembers: (slug: string, projectId: string) =>
    ['project-members', slug, projectId] as const,
  comments: (slug: string, taskId: string) => ['comments', slug, taskId] as const,
  activity: (slug: string, taskId: string) => ['activity', slug, taskId] as const,
  resources: (slug: string, taskId: string) => ['resources', slug, taskId] as const,
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

/**
 * Create a new workspace label. Callers get the created LabelResponse in
 * onSuccess so they can immediately assign it to a task without waiting
 * for the invalidated list to refetch (matters for the inline create-and-
 * assign flow in the task-detail picker).
 */
export function useCreateLabel(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLabelInput) => createLabel(slug, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.labels(slug) });
    },
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
      await qc.cancelQueries({ queryKey: boardKeys.task(slug, taskId) });

      // Snapshot every 'tasks' query slot (there's one per unique filter
      // combo the user has visited). We restore all of them on error.
      const snapshot = qc.getQueriesData<TaskResponse[]>({ queryKey: ['tasks', slug] });
      const singleTask = qc.getQueryData<TaskResponse>(boardKeys.task(slug, taskId));

      qc.setQueriesData<TaskResponse[]>({ queryKey: ['tasks', slug] }, (old) => {
        if (!old) return old;
        return old.map((t) => (t.id === taskId ? { ...t, ...input } : t));
      });
      qc.setQueryData<TaskResponse>(boardKeys.task(slug, taskId), (old) =>
        old ? { ...old, ...input } : old,
      );

      return { snapshot, singleTask, taskId };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, value] of ctx.snapshot) {
        qc.setQueryData(key, value);
      }
      qc.setQueryData(boardKeys.task(slug, ctx.taskId), ctx.singleTask);
    },
    onSuccess: (updated) => {
      // The server response has authoritative denormalised shape (with
      // assignee names, label colours). Sync it into the single-task cache
      // so the detail modal shows the enriched version.
      qc.setQueryData<TaskResponse>(boardKeys.task(slug, updated.id), updated);
    },
  });
}

export function useTask(slug: string, taskId: string | null | undefined) {
  return useQuery({
    queryKey: boardKeys.task(slug, taskId ?? ''),
    queryFn: () => getTask(slug, taskId!),
    enabled: Boolean(slug) && Boolean(taskId),
  });
}

export function useDeleteTask(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(slug, taskId),
    onSuccess: (_r, taskId) => {
      qc.removeQueries({ queryKey: boardKeys.task(slug, taskId) });
      void qc.invalidateQueries({ queryKey: ['tasks', slug] });
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

export function useCreateStatus(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStatusInput) => createStatus(slug, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.statuses(slug) });
    },
  });
}

/**
 * Delete a status. When tasks are attached the caller must pass `moveTo`
 * so the backend can reassign them; the mutation invalidates both the
 * statuses cache AND every tasks list (rows moved statuses under us).
 */
export function useDeleteStatus(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ statusId, moveTo }: { statusId: string; moveTo?: string }) =>
      deleteStatus(slug, statusId, moveTo),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.statuses(slug) });
      void qc.invalidateQueries({ queryKey: ['tasks', slug] });
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

// ---------------------------------------------------------------------------
// Comments + activity (per-task, keyed by taskId)
// ---------------------------------------------------------------------------

export function useComments(slug: string, taskId: string | null | undefined) {
  return useQuery({
    queryKey: boardKeys.comments(slug, taskId ?? ''),
    queryFn: () => listComments(slug, taskId!),
    enabled: Boolean(slug) && Boolean(taskId),
  });
}

/** Post a new comment or reply. On success invalidates both the comments
 *  and activity caches (a COMMENT_ADDED activity row is written server-side
 *  in the same transaction). */
export function useCreateComment(slug: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) => createComment(slug, taskId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.comments(slug, taskId) });
      void qc.invalidateQueries({ queryKey: boardKeys.activity(slug, taskId) });
    },
  });
}

export function useUpdateComment(slug: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: ProseMirrorDoc }) =>
      updateComment(slug, taskId, commentId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.comments(slug, taskId) });
    },
  });
}

export function useDeleteComment(slug: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(slug, taskId, commentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.comments(slug, taskId) });
    },
  });
}

export function useActivity(slug: string, taskId: string | null | undefined) {
  return useQuery({
    queryKey: boardKeys.activity(slug, taskId ?? ''),
    queryFn: () => listActivity(slug, taskId!),
    enabled: Boolean(slug) && Boolean(taskId),
  });
}

// ---------------------------------------------------------------------------
// Resources — per-task link + Cloudinary file attachments
// ---------------------------------------------------------------------------

export function useResources(slug: string, taskId: string | null | undefined) {
  return useQuery({
    queryKey: boardKeys.resources(slug, taskId ?? ''),
    queryFn: () => listResources(slug, taskId!),
    enabled: Boolean(slug) && Boolean(taskId),
  });
}

/**
 * Create a Resource row (either a LINK or a FILE that was already
 * uploaded to Cloudinary). Invalidates the resources cache AND the
 * activity feed — backend writes a RESOURCE_ADDED activity in the
 * same transaction.
 */
export function useCreateResource(slug: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateResourceInput) => createResource(slug, taskId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.resources(slug, taskId) });
      void qc.invalidateQueries({ queryKey: boardKeys.activity(slug, taskId) });
    },
  });
}

export function useDeleteResource(slug: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (resourceId: string) => deleteResource(slug, taskId, resourceId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: boardKeys.resources(slug, taskId) });
    },
  });
}

/**
 * Two-step file upload:
 *   1. `signUpload(slug, taskId)` — backend returns signed Cloudinary
 *      params scoped to this task.
 *   2. Browser POSTs the file bytes directly to Cloudinary (never
 *      through our API).
 *   3. On Cloudinary success, `createResource` writes the FILE row
 *      with the returned `public_id` as `cloudinaryKey`.
 *
 * This hook returns a function that runs all three steps and yields
 * the created ResourceResponse. Errors from any step propagate.
 */
export function useUploadTaskFile(slug: string, taskId: string) {
  const create = useCreateResource(slug, taskId);
  return useMutation({
    mutationFn: async (file: File) => {
      const signed = await signUpload(slug, taskId);
      const form = new FormData();
      form.append('file', file);
      form.append('api_key', signed.apiKey);
      form.append('timestamp', String(signed.timestamp));
      form.append('signature', signed.signature);
      form.append('folder', signed.folder);
      form.append('type', signed.type);
      const cloudRes = await fetch(signed.uploadUrl, { method: 'POST', body: form });
      if (!cloudRes.ok) {
        throw new Error(`Cloudinary upload failed: HTTP ${cloudRes.status}`);
      }
      const uploaded = (await cloudRes.json()) as {
        public_id: string;
        bytes: number;
        format: string;
        resource_type: string;
      };
      return create.mutateAsync({
        type: 'FILE',
        name: file.name,
        cloudinaryKey: uploaded.public_id,
        mimeType: file.type || `${uploaded.resource_type}/${uploaded.format}`,
        sizeBytes: uploaded.bytes,
      });
    },
  });
}

/** On-demand fetcher — call when the user clicks a file link and we
 *  need a fresh short-lived signed read URL. Not a query because the
 *  URL expires and shouldn't be cached. */
export function useResourceUrlFetcher(slug: string, taskId: string) {
  return (resourceId: string) => getResourceUrl(slug, taskId, resourceId);
}
