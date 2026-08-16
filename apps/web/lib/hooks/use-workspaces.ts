'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWorkspace, listWorkspaces, type CreateWorkspaceInput } from '../api/workspaces';

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
