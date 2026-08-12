'use client';

import { useCallback, useState } from 'react';
import { Board } from '@/components/board/board';
import { BoardSearch } from '@/components/board/board-search';
import { FieldsDropdown } from '@/components/board/fields-dropdown';
import { FiltersPopover } from '@/components/board/filters-popover';
import { ViewToggle } from '@/components/board/view-toggle';
import { AddTaskModal } from '@/components/tasks/add-task-modal';
import { TopBar } from '@/components/workspace/top-bar';
import type { TaskListQuery } from '@/lib/api/tasks';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * The workspace's board view. AppShell provides sidebar + auth; TopBar
 * renders the title (Tasks) plus board-level actions, and the Board
 * fills the rest of the pane.
 *
 * `query` is hoisted here so search + filters populate the same
 * TaskListQuery that useTasks consumes — one round-trip per change,
 * cached per unique query shape by TanStack Query.
 */
export default function TasksPage() {
  const workspace = useAuthStore((s) => s.workspace);
  const [query, setQuery] = useState<TaskListQuery>({});

  const onSearchChange = useCallback((q: string) => {
    setQuery((prev) => ({ ...prev, q: q || undefined }));
  }, []);

  if (!workspace) return null;

  return (
    <>
      <TopBar
        title="Tasks"
        actions={
          <div className="flex items-center gap-2">
            <ViewToggle workspaceSlug={workspace.slug} active="board" />
            <BoardSearch onChange={onSearchChange} />
            <FiltersPopover workspaceSlug={workspace.slug} value={query} onChange={setQuery} />
            <FieldsDropdown />
            <AddTaskModal workspaceSlug={workspace.slug} />
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Board workspaceSlug={workspace.slug} query={query} />
      </div>
    </>
  );
}
