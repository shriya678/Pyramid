'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useStatuses, useTasks, useUpdateStatus, useUpdateTask } from '@/lib/hooks/use-board-data';
import type { TaskListQuery } from '@/lib/api/tasks';
import type { StatusResponse, TaskResponse } from '@/lib/api/types';
import { fractionalIndexAt } from '@/lib/board/fractional-index';
import { BoardCard } from './board-card';
import { BoardColumn } from './board-column';
import { BoardSkeleton } from './board-skeleton';
import { QuickAdd } from './quick-add';

/** What the user is currently dragging — powers DragOverlay's clone. */
type DragPreview =
  { kind: 'card'; task: TaskResponse } | { kind: 'column'; status: StatusResponse } | null;

export interface BoardProps {
  workspaceSlug: string;
  /** Server-side filter passed to GET /tasks. Debounced/normalised upstream. */
  query?: TaskListQuery;
}

/**
 * Top-level Kanban surface. Fetches statuses (columns) and tasks
 * concurrently, groups tasks by statusId once loaded, and renders a
 * horizontally-scrollable strip of BoardColumns wrapped in a DndContext.
 *
 * Drag semantics:
 *   - Card → over another card: insert BEFORE that card in its column.
 *   - Card → over an empty column body: append to that column.
 *   - Drop that resolves to "same position" is a no-op.
 *
 * On drop we compute the new orderInColumn via fractionalIndexAt against
 * the destination column's cards (excluding the moving card), then fire
 * useUpdateTask which applies an optimistic patch to every cached tasks
 * slot and rolls back on error.
 */
export function Board({ workspaceSlug, query = {} }: BoardProps) {
  const statuses = useStatuses(workspaceSlug);
  const tasks = useTasks(workspaceSlug, query);
  const updateTask = useUpdateTask(workspaceSlug);
  const updateStatus = useUpdateStatus(workspaceSlug);
  const [preview, setPreview] = useState<DragPreview>(null);

  const grouped = useMemo(() => groupByStatus(tasks.data ?? []), [tasks.data]);

  // PointerSensor with distance:5 so a click doesn't accidentally start a
  // drag — the card is a <Link>, and we still want plain clicks to navigate.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (evt: DragStartEvent) => {
    const data = evt.active.data.current as { type?: string } | undefined;
    if (data?.type === 'card') {
      const task = tasks.data?.find((t) => t.id === evt.active.id);
      if (task) setPreview({ kind: 'card', task });
    } else if (data?.type === 'column') {
      const statusId = String(evt.active.id).replace(/^col-/, '');
      const status = statuses.data?.find((s) => s.id === statusId);
      if (status) setPreview({ kind: 'column', status });
    }
  };

  const handleDragEnd = (evt: DragEndEvent) => {
    setPreview(null);
    const { active, over } = evt;
    if (!over || active.id === over.id) return;

    const activeType = (active.data.current as { type?: string } | undefined)?.type;

    // Column-drag path: reorder statuses via fractional index on Status.order.
    if (activeType === 'column') {
      handleColumnDragEnd(evt);
      return;
    }
    if (activeType !== 'card') return;

    const draggedTask = tasks.data?.find((t) => t.id === active.id);
    if (!draggedTask) return;

    // Determine the destination column. Three shapes for `over`:
    //   - dropped on a card → over.id is a task id; find its column
    //   - dropped on an empty column body → over.data.current.type === 'column-body'
    //   - dropped on a column header (column sortable) → type === 'column'
    //     — treat as "append to that column"
    const overData = over.data.current as { type?: string; statusId?: string } | undefined;
    const destStatusId =
      overData?.type === 'column-body' || overData?.type === 'column'
        ? overData.statusId!
        : (tasks.data?.find((t) => t.id === over.id)?.statusId ?? draggedTask.statusId);

    // Destination list WITHOUT the moving card (needed for correct midpoint).
    const destListAll = grouped.get(destStatusId) ?? [];
    const destList = destListAll.filter((t) => t.id !== draggedTask.id);

    // Where does it land? If over a card, insert BEFORE that card's new index.
    // If over an empty column body, append to end.
    let newIndex: number;
    if (overData?.type === 'column-body' || overData?.type === 'column') {
      newIndex = destList.length;
    } else {
      newIndex = destList.findIndex((t) => t.id === over.id);
      if (newIndex === -1) newIndex = destList.length;
    }

    const newOrder = fractionalIndexAt(
      destList.map((t) => ({ order: t.orderInColumn })),
      newIndex,
    );

    // No-op guard: same column, same order (dropped on itself effectively).
    if (destStatusId === draggedTask.statusId && newOrder === draggedTask.orderInColumn) {
      return;
    }

    updateTask.mutate({
      taskId: draggedTask.id,
      input: {
        statusId: destStatusId,
        orderInColumn: newOrder,
      },
    });
  };

  /**
   * Reorder statuses horizontally. `active.id` is `col-<statusId>` (see
   * BoardColumn's useSortable id). We resolve the destination position
   * from what the drag was over (either another column's sortable id or a
   * card inside a column), then compute the new Status.order via the same
   * fractional-index helper.
   */
  const handleColumnDragEnd = (evt: DragEndEvent) => {
    const { active, over } = evt;
    if (!over) return;
    const cols = statuses.data;
    if (!cols) return;

    const activeStatusId = String(active.id).replace(/^col-/, '');

    // Resolve the destination statusId, whatever the drop target's shape.
    const overData = over.data.current as { type?: string; statusId?: string } | undefined;
    let overStatusId: string | undefined;
    if (String(over.id).startsWith('col-')) {
      overStatusId = String(over.id).slice(4);
    } else if (overData?.statusId) {
      overStatusId = overData.statusId;
    } else {
      // Dropped on a card — resolve via its task.
      overStatusId = tasks.data?.find((t) => t.id === over.id)?.statusId;
    }
    if (!overStatusId || overStatusId === activeStatusId) return;

    // Use arrayMove semantics: dropping active over target places active AT
    // target's index in the new arrangement, shifting others as needed.
    // This means dragging past the last column correctly lands active last,
    // and the fractional-index math then uses the correct pair of neighbours.
    const activeIndex = cols.findIndex((c) => c.id === activeStatusId);
    const overIndex = cols.findIndex((c) => c.id === overStatusId);
    if (activeIndex === -1 || overIndex === -1) return;

    const reordered = [...cols];
    const [moved] = reordered.splice(activeIndex, 1);
    reordered.splice(overIndex, 0, moved!);

    const newPosition = reordered.findIndex((c) => c.id === activeStatusId);
    const prev = reordered[newPosition - 1];
    const next = reordered[newPosition + 1];

    let newOrder: number;
    if (!prev && next) newOrder = next.order - 1000;
    else if (prev && !next) newOrder = prev.order + 1000;
    else if (prev && next) newOrder = (prev.order + next.order) / 2;
    else return; // single-column edge case; nothing to reorder

    if (newOrder === moved!.order) return;

    updateStatus.mutate({ statusId: activeStatusId, input: { order: newOrder } });
  };

  if (statuses.isLoading || tasks.isLoading) {
    return <BoardSkeleton />;
  }

  if (statuses.error || tasks.error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Failed to load the board. Try refreshing.
      </div>
    );
  }

  const columns = statuses.data ?? [];
  if (columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        No columns yet. Add one from Settings → Statuses.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setPreview(null)}
    >
      <SortableContext
        items={columns.map((c) => `col-${c.id}`)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex h-full min-h-0 flex-nowrap gap-3 overflow-x-auto overflow-y-hidden p-4">
          {columns.map((s) => (
            <BoardColumn
              key={s.id}
              workspaceSlug={workspaceSlug}
              status={s}
              tasks={grouped.get(s.id) ?? []}
              footer={<QuickAdd workspaceSlug={workspaceSlug} statusId={s.id} />}
            />
          ))}
        </div>
      </SortableContext>

      {/* Floating clone of the dragged item — follows the cursor and gives
          the drag physical presence beyond the source's dimmed placeholder. */}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {preview?.kind === 'card' ? (
          <div className="rotate-1 opacity-95 shadow-lg">
            <BoardCard workspaceSlug={workspaceSlug} task={preview.task} />
          </div>
        ) : preview?.kind === 'column' ? (
          <div className="pointer-events-none opacity-80 shadow-lg">
            <div className="w-72 rounded-lg border bg-muted/60 px-3 py-2">
              <span className="text-sm font-medium">{preview.status.name}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function groupByStatus(tasks: TaskResponse[]): Map<string, TaskResponse[]> {
  const out = new Map<string, TaskResponse[]>();
  for (const t of tasks) {
    const list = out.get(t.statusId) ?? [];
    list.push(t);
    out.set(t.statusId, list);
  }
  // Preserve orderInColumn ascending — API already returns sorted, but sort
  // again defensively in case the mutation cache stitches an unsorted insert.
  for (const list of out.values()) {
    list.sort((a, b) => a.orderInColumn - b.orderInColumn);
  }
  return out;
}
