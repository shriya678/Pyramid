'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Root route — routes users to the right place based on session state.
 *   Signed in with a workspace → /w/<slug>/tasks
 *   Anonymous                  → /login
 *
 * Waits for zustand rehydration to avoid a flash of the wrong route on cold load.
 */
export default function RootPage() {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspace = useAuthStore((s) => s.workspace);

  useEffect(() => {
    if (!hydrated) return;
    if (accessToken && workspace) {
      router.replace(`/w/${workspace.slug}/tasks`);
    } else {
      router.replace('/login');
    }
  }, [hydrated, accessToken, workspace, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}
