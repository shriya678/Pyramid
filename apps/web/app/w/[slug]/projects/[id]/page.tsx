'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { Board } from '@/components/board/board';
import { ProjectHeader } from '@/components/projects/project-header';
import { ProjectMembersPanel } from '@/components/projects/project-members-panel';
import { AddTaskModal } from '@/components/tasks/add-task-modal';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { TopBar } from '@/components/workspace/top-bar';
import { useMyWorkspaceRole, useProject } from '@/lib/hooks/use-board-data';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Project Detail page (Figma p12). Header shows the project's fields; the
 * body renders a Board scoped to this project via `query={{ projectId }}`.
 *
 * A "← Back to Projects" link sits in the top bar so the destination is
 * always one click away — this page doesn't yet own breadcrumbs.
 */
export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = use(params);
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);
  const project = useProject(slug, id);
  const myRole = useMyWorkspaceRole(slug, user?.id);
  const [membersOpen, setMembersOpen] = useState(false);

  if (!workspace) return null;

  return (
    <>
      <TopBar
        title={
          <Link
            href={`/w/${slug}/projects`}
            className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Projects
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMembersOpen(true)}
              aria-label="Project members"
            >
              <Users className="mr-1.5 h-4 w-4" />
              Members
            </Button>
            <AddTaskModal workspaceSlug={slug} defaultProjectId={id} />
          </div>
        }
      />
      {project.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading project…</div>
      ) : project.error ? (
        <div className="p-6 text-sm text-muted-foreground">
          Project not found. It may have been deleted or you may not have access.
        </div>
      ) : project.data ? (
        <>
          <ProjectHeader
            workspaceSlug={slug}
            workspaceRole={myRole ?? 'MEMBER'}
            project={project.data}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <Board workspaceSlug={slug} query={{ projectId: id }} />
          </div>
          <Sheet open={membersOpen} onOpenChange={setMembersOpen}>
            <SheetContent side="right" className="w-full p-0 sm:max-w-md">
              <SheetTitle className="sr-only">Project members</SheetTitle>
              <div className="p-4">
                {user ? (
                  <ProjectMembersPanel
                    workspaceSlug={slug}
                    projectId={id}
                    workspaceRole={myRole ?? 'MEMBER'}
                    currentUserId={user.id}
                  />
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </>
  );
}
