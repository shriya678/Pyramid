'use client';

import { use, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Board } from '@/components/board/board';
import { BoardSearch } from '@/components/board/board-search';
import { FieldsDropdown } from '@/components/board/fields-dropdown';
import { FiltersPopover } from '@/components/board/filters-popover';
import { ViewToggle } from '@/components/board/view-toggle';
import { AddTaskModal } from '@/components/tasks/add-task-modal';
import { TaskDetail } from '@/components/task-detail/task-detail';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TopBar } from '@/components/workspace/top-bar';
import type { TaskListQuery } from '@/lib/api/tasks';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Non-intercepted task detail route — hit on direct visits (bookmark,
 * refresh, hard nav, new tab).
 *
 * Renders the same content the user sees when they click a card from the
 * board: the Tasks page underneath, and TaskDetail as a modal on top.
 * That way refresh doesn't jarringly swap to a full-page layout — the
 * URL is stable, the modal reappears, and the user closes it (or hits
 * back) to end up on /tasks with the board visible.
 */
export default function TaskDetailFullPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = use(params);
  const router = useRouter();
  const workspace = useAuthStore((s) => s.workspace);
  const [query, setQuery] = useState<TaskListQuery>({});

  const onSearchChange = useCallback((q: string) => {
    setQuery((prev) => ({ ...prev, q: q || undefined }));
  }, []);

  if (!workspace) return null;

  const closeToTasks = () => router.push(`/w/${slug}/tasks`);

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
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) closeToTasks();
        }}
      >
        <DialogContent className="h-[85vh] max-h-none p-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">Task detail</DialogTitle>
          <TaskDetail
            workspaceSlug={slug}
            taskId={id}
            onDeleted={closeToTasks}
            onExpandToFullPage={() => router.push(`/w/${slug}/t/${id}/full`)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
