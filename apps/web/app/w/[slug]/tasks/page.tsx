'use client';

import { use } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Placeholder page while the Board view is being built in the next PR.
 * Proves the auth flow lands somewhere real — same shell that the Board
 * will render into, minus the columns.
 */
export default function TasksPlaceholderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <AuthGuard requiredSlug={slug}>
      <TasksPlaceholderShell />
    </AuthGuard>
  );
}

function TasksPlaceholderShell() {
  const user = useAuthStore((s) => s.user);
  const workspace = useAuthStore((s) => s.workspace);
  const clear = useAuthStore((s) => s.clear);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16 space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
          <h1 className="text-2xl font-semibold">{workspace?.name}</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user?.fullName}</span>{' '}
            <span className="text-muted-foreground">({user?.username})</span>
            {user?.isGuest ? (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">guest</span>
            ) : null}
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Board view — coming next PR</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              You&apos;re signed in and routed to your workspace. Kanban columns, drag-and-drop,
              Task Detail modal, filters, and the whole Figma board render into this shell in the
              follow-up PR.
            </p>
            <p>
              Meanwhile: everything the backend needs is live — try the Postman collection at{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                docs/postman/task-mgmt.postman_collection.json
              </code>
              .
            </p>
          </CardContent>
        </Card>

        <div className="pt-4">
          <Button
            variant="outline"
            onClick={() => {
              clear();
              window.location.href = '/login';
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
