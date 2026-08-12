'use client';

import Link from 'next/link';
import { CalendarDays, ChevronRight, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Priority, ProjectResponse } from '@/lib/api/types';
import { useProjects, useWorkspaceMembers } from '@/lib/hooks/use-board-data';

/** Priority colour ramp — matches BoardCard so users get a consistent language. */
const PRIORITY_STYLES: Record<Exclude<Priority, 'NONE'>, string> = {
  URGENT: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  LOW: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
};

export interface ProjectsListProps {
  workspaceSlug: string;
}

/**
 * Card-grid list of every project the current user can see. Each row is a
 * <Link> to its Project Detail page. Empty state prompts the user to create
 * the first one via the top-right "+ Add project" button (mounted by the
 * page component, not here).
 */
export function ProjectsList({ workspaceSlug }: ProjectsListProps) {
  const projects = useProjects(workspaceSlug);
  const members = useWorkspaceMembers(workspaceSlug);

  if (projects.isLoading) {
    return <ProjectsListSkeleton />;
  }
  if (projects.error) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        Failed to load projects. Try refreshing.
      </p>
    );
  }
  const rows = projects.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">No projects yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Create your first project with the “+ Add project” button in the top bar.
        </p>
      </div>
    );
  }

  const memberById = new Map((members.data ?? []).map((m) => [m.userId, m.user]));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((p) => (
        <ProjectCard
          key={p.id}
          workspaceSlug={workspaceSlug}
          project={p}
          lead={p.leadUserId ? memberById.get(p.leadUserId) : undefined}
        />
      ))}
    </div>
  );
}

function ProjectCard({
  workspaceSlug,
  project,
  lead,
}: {
  workspaceSlug: string;
  project: ProjectResponse;
  lead: { fullName: string; avatarUrl: string | null } | undefined;
}) {
  return (
    <Link
      href={`/w/${workspaceSlug}/projects/${project.id}`}
      className="group flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-semibold">{project.name}</h3>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      {project.description ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {project.priority !== 'NONE' && (
          <span
            className={cn(
              'inline-flex items-center rounded px-1.5 py-0.5 font-medium',
              PRIORITY_STYLES[project.priority as Exclude<Priority, 'NONE'>],
            )}
          >
            {project.priority.charAt(0) + project.priority.slice(1).toLowerCase()}
          </span>
        )}
        {project.dueDate && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {new Date(project.dueDate).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
        {lead && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {lead.fullName}
          </span>
        )}
      </div>
    </Link>
  );
}

function ProjectsListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-lg border bg-card" />
      ))}
    </div>
  );
}
