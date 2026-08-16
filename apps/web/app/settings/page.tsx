'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DeleteWorkspacePanel } from '@/components/settings/delete-workspace-panel';
import { LeaveWorkspacePanel } from '@/components/settings/leave-workspace-panel';
import { ProfilePanel } from '@/components/settings/profile-panel';
import { StatusesPanel } from '@/components/settings/statuses-panel';
import { WorkspaceMembersPanel } from '@/components/settings/workspace-members-panel';
import { useMyWorkspaceRole } from '@/lib/hooks/use-board-data';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Settings screen. Route sits outside the workspace shell because Figma
 * p13 gives Settings its own chrome. Sections top-to-bottom: Profile,
 * Workspace Members, Statuses, then the two destructive sections at the
 * bottom — Leave (any member) and Delete (owner only). Destructive at
 * the end so it doesn't compete with routine settings.
 *
 * Theme + accent color pickers already live in the sidebar user menu.
 */
export default function SettingsPage() {
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);
  const myRole = useMyWorkspaceRole(workspace?.slug ?? '', user?.id);
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
        {workspace ? <p className="mt-1 text-sm text-muted-foreground">{workspace.name}</p> : null}

        {workspace && user ? (
          <div className="mt-8 space-y-6">
            <ProfilePanel />
            <WorkspaceMembersPanel
              workspaceSlug={workspace.slug}
              workspaceRole={myRole ?? 'MEMBER'}
              currentUserId={user.id}
            />
            <StatusesPanel workspaceSlug={workspace.slug} workspaceRole={myRole ?? 'MEMBER'} />
            <LeaveWorkspacePanel
              workspaceSlug={workspace.slug}
              workspaceName={workspace.name}
              workspaceRole={myRole ?? 'MEMBER'}
            />
            <DeleteWorkspacePanel
              workspaceSlug={workspace.slug}
              workspaceName={workspace.name}
              workspaceRole={myRole ?? 'MEMBER'}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
