'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useWorkspaces } from '@/lib/hooks/use-workspaces';

/**
 * Client-side gate. Redirects to /login if the persisted session is empty
 * (or if the workspace slug on the URL isn't one the user is a member of).
 *
 * Server-side middleware can't do this because tokens live in localStorage,
 * not cookies. Trade-off: brief flash of the loading state on cold load
 * while zustand rehydrates — acceptable and normal for this pattern.
 *
 * Multi-workspace behaviour: when `requiredSlug` is present and doesn't
 * match the store's current workspace, we consult the user's membership
 * list. If the URL slug corresponds to a real membership, the store swaps
 * to match the URL (this is how the switcher works: it navigates, we
 * swap). If the slug isn't in the list, we bounce back to the store's
 * primary workspace.
 */
export function AuthGuard({
  children,
  requiredSlug,
}: {
  children: ReactNode;
  /** If set, also enforce that this matches a workspace the user is a member of. */
  requiredSlug?: string;
}) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspace = useAuthStore((s) => s.workspace);

  // Only fetch the list when we actually need to reconcile a mismatch —
  // avoids a needless request on the (very common) matched-slug path.
  const needsReconcile = Boolean(
    hydrated && accessToken && requiredSlug && workspace && workspace.slug !== requiredSlug,
  );
  const workspaces = useWorkspaces();

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    if (!requiredSlug || !workspace) return;
    if (workspace.slug === requiredSlug) return;

    // Slug mismatch. Wait for the membership list before deciding.
    if (!workspaces.data) return;
    const target = workspaces.data.find((w) => w.slug === requiredSlug);
    if (target) {
      // Legit switch — sync the store's workspace to the URL. Direct
      // setState (not setSession) so tokens + user stay untouched and
      // no schema fields need synthesizing.
      useAuthStore.setState({
        workspace: { id: target.id, slug: target.slug, name: target.name },
      });
    } else {
      // Not a member — send them back to their primary workspace.
      router.replace(`/w/${workspace.slug}/tasks`);
    }
  }, [hydrated, accessToken, workspace, requiredSlug, workspaces.data, router]);

  if (!hydrated || !accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  // Also hold the loading state while a workspace-switch reconcile is in
  // flight — otherwise children mount against the wrong slug for one frame.
  if (needsReconcile && !workspaces.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Switching workspace…</p>
      </div>
    );
  }
  return <>{children}</>;
}
