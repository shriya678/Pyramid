'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { TaskDetail } from '@/components/task-detail/task-detail';
import { TopBar } from '@/components/workspace/top-bar';

/**
 * Dedicated full-page task view. Reached by clicking the maximize icon
 * inside the modal — a "give me all the room" affordance for editing.
 * No board underneath, no dialog frame, just TaskDetail edge-to-edge
 * under the standard TopBar. Back link returns to /tasks.
 */
export default function TaskDetailFullOnlyPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = use(params);
  const router = useRouter();

  return (
    <>
      <TopBar
        title={
          <Link
            href={`/w/${slug}/tasks`}
            className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Tasks
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <TaskDetail
          workspaceSlug={slug}
          taskId={id}
          onDeleted={() => router.push(`/w/${slug}/tasks`)}
        />
      </div>
    </>
  );
}
