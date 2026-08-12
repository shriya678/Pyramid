'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listLabels } from '../api/labels';
import { listWorkspaceMembers } from '../api/members';
import { listStatuses } from '../api/statuses';
import { createTask, listTasks, type CreateTaskInput, type TaskListQuery } from '../api/tasks';

/** Query-key factory. Keeping these centralised keeps invalidations honest. */
export const boardKeys = {
  statuses: (slug: string) => ['statuses', slug] as const,
  labels: (slug: string) => ['labels', slug] as const,
  members: (slug: string) => ['members', slug] as const,
  tasks: (slug: string, query: TaskListQuery) => ['tasks', slug, query] as const,
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
