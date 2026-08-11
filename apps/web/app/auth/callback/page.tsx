'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore, type AuthUser, type AuthWorkspace } from '@/lib/stores/auth-store';

/**
 * OAuth landing page. Backend redirects here after a successful Google flow
 * with the token pair in the URL query. We:
 *   1. Read tokens from query
 *   2. Prime the auth store with just the tokens (so the api client's
 *      interceptor can attach the Bearer on the next call)
 *   3. Fetch /auth/me to hydrate user + primary workspace
 *   4. Persist the full session and hop to the workspace's tasks page
 *
 * Query params (set by AuthController.googleCallback):
 *   token, refresh, accessExp, refreshExp
 */
function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);

  const token = params.get('token');
  const refresh = params.get('refresh');
  const accessExp = params.get('accessExp');
  const refreshExp = params.get('refreshExp');
  const missing = !token || !refresh;

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (missing) return;
    let cancelled = false;

    const load = async () => {
      // Prime the store with tokens so the interceptor can attach them
      // on the /auth/me call below.
      useAuthStore.getState().updateTokens({
        accessToken: token!,
        refreshToken: refresh!,
        accessTokenExpiresAt: accessExp ?? '',
        refreshTokenExpiresAt: refreshExp ?? '',
      });

      try {
        const res = await api.get<AuthUser & { primaryWorkspace: AuthWorkspace | null }>(
          '/auth/me',
        );
        if (cancelled) return;

        if (!res.data.primaryWorkspace) {
          setError('Signed in, but no workspace was provisioned. Please try again.');
          return;
        }

        const { primaryWorkspace, ...user } = res.data;
        setSession({
          accessToken: token!,
          refreshToken: refresh!,
          accessTokenExpiresAt: accessExp ?? '',
          refreshTokenExpiresAt: refreshExp ?? '',
          user,
          workspace: primaryWorkspace,
        });
        router.replace(`/w/${primaryWorkspace.slug}/tasks`);
      } catch {
        if (!cancelled) {
          setError('Sign-in succeeded but hydration failed. Please try again.');
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [missing, token, refresh, accessExp, refreshExp, router, setSession]);

  if (missing) {
    return (
      <>
        <h1 className="text-lg font-semibold text-red-700 dark:text-red-300">Sign-in failed</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Missing tokens in callback URL. Please try signing in again.
        </p>
        <a
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
        >
          Back to login
        </a>
      </>
    );
  }
  if (error) {
    return (
      <>
        <h1 className="text-lg font-semibold text-red-700 dark:text-red-300">Sign-in failed</h1>
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
        <a
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
        >
          Back to login
        </a>
      </>
    );
  }
  return (
    <>
      <h1 className="text-lg font-semibold">Signing you in…</h1>
      <p className="mt-3 text-sm text-muted-foreground">Fetching your workspace.</p>
    </>
  );
}

export default function AuthCallbackPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <AuthCallbackInner />
        </Suspense>
      </div>
    </main>
  );
}
