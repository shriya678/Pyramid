'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TopBar } from '@/components/workspace/top-bar';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Placeholder page while the Board view is being built in the next PR.
 * The workspace layout already provides sidebar + AuthGuard; here we only
 * render the top bar + content.
 */
export default function TasksPage() {
  const workspace = useAuthStore((s) => s.workspace);

  return (
    <>
      <TopBar title="Tasks" />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <p className="text-sm text-muted-foreground">
            Signed into <span className="font-medium text-foreground">{workspace?.name}</span>.
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Board view — coming next PR</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Kanban columns, drag-and-drop, Task Detail modal, filters, and the whole Figma board
                render into this slot in the follow-up PR.
              </p>
              <p>
                Meanwhile the sidebar dropdown (top-left avatar + workspace name) gives you the
                theme and accent color pickers — try clicking through them.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
