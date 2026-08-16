'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore, type AuthUser, type AuthWorkspace } from '@/lib/stores/auth-store';

/**
 * OAuth landing page. Backend redirects here after a Google flow with one
 * of two payload shapes:
 *
 *   Success — `?token=&refresh=&accessExp=&refreshExp=` (+ optional `?merged=1`
 *     signalling a guest → Google upgrade). We prime the auth store and
 *     fetch /auth/me to hydrate the user + workspace.
 *
 *   Merge conflict — `?error=merge_conflict&message=<detail>`. The user
 *     tried to upgrade a guest session with a Google account already used
 *     by someone else. We show the message and offer a "sign out and try
 *     again" button that clears the guest session and drops back to /login.
 */
function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const clearAuth = useAuthStore((s) => s.clear);

  const errorCode = params.get('error');
  const errorMessage = params.get('message');
  const token = params.get('token');
  const refresh = params.get('refresh');
  const accessExp = params.get('accessExp');
  const refreshExp = params.get('refreshExp');
  const merged = params.get('merged') === '1';
  const missing = !errorCode && (!token || !refresh);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (missing || errorCode) return;
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

  if (errorCode === 'merge_conflict') {
    const goBackToGoogle = () => {
      // Clear the guest session before dropping to /login so the user can
      // start fresh with the Google account that owns their Google email.
      clearAuth();
      router.replace('/login');
    };
    return (
      <>
        <h1 className="text-lg font-semibold text-amber-700 dark:text-amber-300">
          Couldn&apos;t merge accounts
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {errorMessage ??
            'This Google account is already linked to another user. Sign out of your guest session, then log in with Google directly to use that account.'}
        </p>
        <button
          type="button"
          onClick={goBackToGoogle}
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sign out and log in with Google
        </button>
      </>
    );
  }
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
      <h1 className="text-lg font-semibold">
        {merged ? 'Upgrading your account…' : 'Signing you in…'}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {merged
          ? 'Attaching your Google credentials — your workspace and tasks stay the same.'
          : 'Fetching your workspace.'}
      </p>
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
