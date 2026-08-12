'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ViewToggle } from '@/components/board/view-toggle';
import { TopBar } from '@/components/workspace/top-bar';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Placeholder for the List view. The View toggle exists here already so the
 * follow-up "List view" PR only has to swap this card for the real list —
 * top-bar chrome and routing don't need to change.
 */
export default function TasksListPage() {
  const workspace = useAuthStore((s) => s.workspace);
  if (!workspace) return null;
  return (
    <>
      <TopBar title="Tasks" actions={<ViewToggle workspaceSlug={workspace.slug} active="list" />} />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">List view — coming next</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Same tasks as the Board, but grouped by status with collapsible sections and
                per-user column visibility. Ships in the follow-up frontend PR.
              </p>
              <p>Switch back to the Board via the toggle in the top-right.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
