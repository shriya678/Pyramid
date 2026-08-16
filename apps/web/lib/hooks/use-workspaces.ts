'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspace,
  deleteWorkspace,
  leaveWorkspace,
  listWorkspaces,
  type CreateWorkspaceInput,
} from '../api/workspaces';
import { updateMe, type UpdateMeInput } from '../api/me';
import { useAuthStore } from '../stores/auth-store';

/**
 * Query key for the current user's workspace list. Kept as its own key
 * (not folded into boardKeys) because it's user-scoped, not
 * workspace-scoped — invalidating a single workspace's cache shouldn't
 * refetch the switcher.
 */
export const workspacesKey = ['workspaces', 'mine'] as const;

/**
 * The current user's workspace memberships. Used by the switcher and by
 * AuthGuard to validate that a URL slug corresponds to a workspace the
 * user is actually a member of before letting the store swap over.
 */
export function useWorkspaces() {
  return useQuery({
    queryKey: workspacesKey,
    queryFn: listWorkspaces,
    // The list rarely changes mid-session (a user creates one occasionally,
    // is invited to one occasionally). A generous staleTime keeps the
    // switcher instant on repeated opens.
    staleTime: 60 * 1000,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => createWorkspace(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workspacesKey });
    },
  });
}

/**
 * Leave a workspace. On success the caller is no longer a member — routing
 * away from that workspace and clearing any workspace-scoped caches is the
 * caller's job (LeaveWorkspacePanel handles it).
 */
export function useLeaveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => leaveWorkspace(slug),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workspacesKey });
    },
  });
}

/**
 * Permanently delete a workspace. Also nukes every cache entry that
 * referenced it — otherwise stale board/task queries would linger and
 * surface phantom 404s if the router hasn't moved on yet.
 */
export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => deleteWorkspace(slug),
    onSuccess: (_res, slug) => {
      void qc.invalidateQueries({ queryKey: workspacesKey });
      // Drop every cached entry keyed by this slug — statuses, tasks,
      // labels, members, projects. Cheaper than listing them all.
      qc.removeQueries({
        predicate: (q) => q.queryKey.includes(slug),
      });
    },
  });
}

/**
 * PATCH /auth/me. On success the auth store's `user` is synced so the
 * sidebar avatar / name / email reflect the update immediately — no
 * refetch needed.
 */
export function useUpdateMe() {
  return useMutation({
    mutationFn: (input: UpdateMeInput) => updateMe(input),
    onSuccess: (updated) => {
      useAuthStore.setState({ user: updated });
    },
  });
}
