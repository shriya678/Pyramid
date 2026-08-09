'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

/**
 * Backend redirects here after a successful Google OAuth handshake with the
 * token pair in query params. We stash them in localStorage and hop to the
 * app shell. Kept as a tiny client component — no need to render anything
 * meaningful unless something goes wrong.
 *
 * Query params (all populated by AuthController.googleCallback):
 *   token       — access JWT (15m)
 *   refresh     — opaque refresh (30d)
 *   accessExp   — ISO expiry of access token
 *   refreshExp  — ISO expiry of refresh token
 *
 * Note: useSearchParams must live inside a Suspense boundary at the page
 * level, per Next.js App Router requirements. The default export wraps
 * the actual body in <Suspense>.
 */
function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();

  // Derive validity at render time; setState inside effects is disallowed
  // by react-hooks/set-state-in-effect in React 19.
  const token = params.get('token');
  const refresh = params.get('refresh');
  const accessExp = params.get('accessExp');
  const refreshExp = params.get('refreshExp');
  const missing = !token || !refresh;

  useEffect(() => {
    if (missing) return;
    try {
      window.localStorage.setItem('accessToken', token!);
      window.localStorage.setItem('refreshToken', refresh!);
      if (accessExp) window.localStorage.setItem('accessTokenExpiresAt', accessExp);
      if (refreshExp) window.localStorage.setItem('refreshTokenExpiresAt', refreshExp);
    } catch (err) {
      // Rare: private mode with storage disabled. Log and let user figure it out
      // rather than papering over it — a broken redirect is a clearer signal.
      console.error('Failed to persist tokens', err);
      return;
    }
    // Clear the URL bar so the tokens don't sit in history/screenshots, then
    // hand off to the app shell.
    router.replace('/');
  }, [missing, token, refresh, accessExp, refreshExp, router]);

  return missing ? (
    <>
      <h1 className="text-lg font-semibold text-red-700 dark:text-red-300">Sign-in failed</h1>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Missing tokens in callback URL. Please try signing in again.
      </p>
      <a
        href="/login"
        className="mt-6 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
      >
        Back to login
      </a>
    </>
  ) : (
    <>
      <h1 className="text-lg font-semibold">Signing you in…</h1>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Storing your session and redirecting.
      </p>
    </>
  );
}

export default function AuthCallbackPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
          <AuthCallbackInner />
        </Suspense>
      </div>
    </main>
  );
}
