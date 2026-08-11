'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Placeholder for the full Settings screen (Figma p13). Reachable from the
 * workspace user menu's "Settings" item so that link doesn't 404 today.
 * The real page (Profile / Theme / Color / Leave Workspace) ships later.
 */
export default function SettingsPage() {
  const workspace = useAuthStore((s) => s.workspace);
  const backHref = workspace ? `/w/${workspace.slug}/tasks` : '/';

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Link>

        <h1 className="mt-6 text-2xl font-semibold">Settings</h1>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Coming soon</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Profile editing, theme picker, accent color picker, and Leave Workspace all live here
              in the follow-up PR.
            </p>
            <p>
              Meanwhile the theme + accent color pickers already work from the sidebar user menu
              (top-left avatar).
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
