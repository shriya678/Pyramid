'use client';

import Link from 'next/link';
import { KanbanSquare, List as ListIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BoardListView = 'board' | 'list';

export interface ViewToggleProps {
  workspaceSlug: string;
  active: BoardListView;
}

/**
 * Segmented control switching between Board (`/tasks`) and List
 * (`/tasks/list`). Uses <Link> so navigation is instant and the URL is
 * bookmarkable per view. List view is a stub in this PR — the segmented
 * control ships now so the follow-up doesn't have to touch page chrome.
 */
export function ViewToggle({ workspaceSlug, active }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      <ViewButton
        href={`/w/${workspaceSlug}/tasks`}
        active={active === 'board'}
        icon={<KanbanSquare className="h-3.5 w-3.5" />}
        label="Board"
      />
      <ViewButton
        href={`/w/${workspaceSlug}/tasks/list`}
        active={active === 'list'}
        icon={<ListIcon className="h-3.5 w-3.5" />}
        label="List"
      />
    </div>
  );
}

interface ViewButtonProps {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}

function ViewButton({ href, active, icon, label }: ViewButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
