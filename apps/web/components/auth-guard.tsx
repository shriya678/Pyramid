'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Client-side gate. Redirects to /login if the persisted session is empty
 * (or if the workspace slug on the URL doesn't match the caller's).
 *
 * Server-side middleware can't do this because tokens live in localStorage,
 * not cookies. Trade-off: brief flash of the loading state on cold load
 * while zustand rehydrates — acceptable and normal for this pattern.
 */
export function AuthGuard({
  children,
  requiredSlug,
}: {
  children: ReactNode;
  /** If set, also enforce that this matches the user's current workspace slug. */
  requiredSlug?: string;
}) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspace = useAuthStore((s) => s.workspace);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    if (requiredSlug && workspace && workspace.slug !== requiredSlug) {
      // Wrong workspace slug in the URL — bounce to the user's actual one.
      router.replace(`/w/${workspace.slug}/tasks`);
    }
  }, [hydrated, accessToken, workspace, requiredSlug, router]);

  if (!hydrated || !accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  return <>{children}</>;
}
