'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TaskDetail } from '@/components/task-detail/task-detail';

/**
 * Intercepted task detail route — renders on top of whatever the user was
 * looking at (board, list, project detail) when they clicked a card. The
 * URL updates to /w/[slug]/t/[id] so the link is shareable, but hitting
 * that URL fresh loads the non-intercepted /t/[id]/page.tsx variant
 * instead of this modal.
 *
 * The task-detail lives at /t/[id] (not /tasks/[id]) so the dynamic
 * segment doesn't collide with static siblings like /tasks/list — Next 16
 * parallel routes fail to render the children slot when the intercept
 * matches the same URL segment as a static child.
 *
 * Closing (Escape, backdrop click, delete) calls router.back() so we
 * un-intercept and land back on the source page.
 */
export default function InterceptedTaskDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = use(params);
  const router = useRouter();

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) router.back();
      }}
    >
      <DialogContent className="h-[85vh] max-h-none p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">Task detail</DialogTitle>
        <TaskDetail
          workspaceSlug={slug}
          taskId={id}
          onDeleted={() => router.back()}
          // Expand → open the /full page in a NEW tab. Users kept losing
          // their board context when the expand replaced the current tab;
          // opening in a new tab lets them keep the board open and refer
          // between the two.
          onExpandToFullPage={() => {
            window.open(`/w/${slug}/t/${id}/full`, '_blank', 'noopener,noreferrer');
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
