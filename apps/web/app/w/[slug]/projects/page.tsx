'use client';

import { AddProjectModal } from '@/components/projects/add-project-modal';
import { ProjectsList } from '@/components/projects/projects-list';
import { TopBar } from '@/components/workspace/top-bar';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Projects list page. Header carries the +Add Project button (mounted here
 * so the TopBar remains a dumb slot component). The full-height grid
 * inside is a card layout populated by useProjects.
 */
export default function ProjectsPage() {
  const workspace = useAuthStore((s) => s.workspace);
  if (!workspace) return null;
  return (
    <>
      <TopBar title="Projects" actions={<AddProjectModal workspaceSlug={workspace.slug} />} />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <ProjectsList workspaceSlug={workspace.slug} />
      </div>
    </>
  );
}
