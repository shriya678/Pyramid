'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, apiConfig } from '@/lib/api';
import { useAuthStore, type AuthPayload } from '@/lib/stores/auth-store';

/**
 * Public route. Two entry paths (matches Figma p1):
 *   - Continue as Guest → POST /auth/guest → store session → /w/<slug>/tasks
 *   - Login with Google → window.location = <api>/auth/google
 *     (must be a full page navigation, not fetch — Google needs to redirect
 *      the browser through the OAuth dance)
 *
 * If the user hits /login while already signed in, quietly redirect to their
 * primary workspace so refreshing this page isn't a footgun.
 */
export default function LoginPage() {
  const router = useRouter();
  const workspace = useAuthStore((s) => s.workspace);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hydrated = useAuthStore((s) => s.hydrated);
  const setSession = useAuthStore((s) => s.setSession);

  const [busy, setBusy] = useState<'guest' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Signed-in users bounce straight to their workspace.
  useEffect(() => {
    if (hydrated && accessToken && workspace) {
      router.replace(`/w/${workspace.slug}/tasks`);
    }
  }, [hydrated, accessToken, workspace, router]);

  const handleGuest = async () => {
    setError(null);
    setBusy('guest');
    try {
      const res = await api.post<AuthPayload>('/auth/guest');
      setSession(res.data);
      router.replace(`/w/${res.data.workspace.slug}/tasks`);
    } catch {
      setError('Could not create a guest session. Please try again.');
      setBusy(null);
    }
  };

  const handleGoogle = () => {
    // Full page navigation — Google's OAuth needs the browser to follow 302s
    // through their consent screen.
    window.location.href = `${apiConfig.baseUrl}/auth/google`;
    setBusy('google');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <BrandMark />
          <span className="text-sm font-medium text-foreground">Pyramid</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Let&apos;s get back on track</CardTitle>
            <CardDescription>Continue as a guest or sign in with Google.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button type="button" onClick={handleGuest} disabled={busy !== null} className="w-full">
              {busy === 'guest' ? 'Creating guest session…' : 'Continue as Guest'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogle}
              disabled={busy !== null}
              className="w-full"
            >
              <GoogleIcon />
              Login with Google
            </Button>
            {error ? (
              <p className="mt-1 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : null}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          By clicking continue, you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

/** Small pyramid mark stand-in until a real logo is designed. */
function BrandMark() {
  return (
    <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="currentColor">
        <path d="M12 3 3 20h18L12 3Zm0 4.5L17.9 18H6.1L12 7.5Z" />
      </svg>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17Z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46Z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18a13.2 13.2 0 0 1 0-8.36v-5.7H4.34a22 22 0 0 0 0 19.76l7.35-5.7Z"
      />
      <path
        fill="#EA4335"
        d="M24 9.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 3.18 29.93 1 24 1 15.4 1 7.99 5.93 4.34 13.12l7.35 5.7C13.42 13.62 18.27 9.75 24 9.75Z"
      />
    </svg>
  );
}
