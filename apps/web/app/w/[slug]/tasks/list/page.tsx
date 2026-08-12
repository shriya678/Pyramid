'use client';

import { useCallback, useState } from 'react';
import { BoardSearch } from '@/components/board/board-search';
import { FieldsDropdown } from '@/components/board/fields-dropdown';
import { FiltersPopover } from '@/components/board/filters-popover';
import { ViewToggle } from '@/components/board/view-toggle';
import { TaskList } from '@/components/list/task-list';
import { AddTaskModal } from '@/components/tasks/add-task-modal';
import { TopBar } from '@/components/workspace/top-bar';
import type { TaskListQuery } from '@/lib/api/tasks';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Task list view — same data as the Board, grouped into collapsible
 * sections per status. Shares the same top-bar toolbar (search / filters /
 * fields / view toggle) so switching between views feels seamless.
 */
export default function TasksListPage() {
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
            <ViewToggle workspaceSlug={workspace.slug} active="list" />
            <BoardSearch onChange={onSearchChange} />
            <FiltersPopover workspaceSlug={workspace.slug} value={query} onChange={setQuery} />
            <FieldsDropdown />
            <AddTaskModal workspaceSlug={workspace.slug} />
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <TaskList workspaceSlug={workspace.slug} query={query} />
      </div>
    </>
  );
}
