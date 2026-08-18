'use client';

import { useState } from 'react';
import { Pencil, Reply, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CommentResponse, ThreadedCommentResponse } from '@/lib/api/types';
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
} from '@/lib/hooks/use-board-data';
import { useAuthStore } from '@/lib/stores/auth-store';
import { CommentComposer } from './comment-composer';
import { MentionText } from './mention-text';

export interface CommentsPanelProps {
  workspaceSlug: string;
  taskId: string;
  /** Current user's role — moderator (OWNER/ADMIN) can delete others' comments. */
  workspaceRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'COLLABORATOR';
}

/**
 * Threaded comments for a task. Top-level composer at the top; below it a
 * list of top-level comments each with (up to one level of) nested replies.
 * @username tokens in bodies render highlighted via MentionText.
 *
 * Edit is author-only (server enforces); delete is author OR OWNER/ADMIN
 * (moderator). Both actions live in a small row that appears on hover of
 * a comment.
 */
export function CommentsPanel({ workspaceSlug, taskId, workspaceRole }: CommentsPanelProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const comments = useComments(workspaceSlug, taskId);
  const create = useCreateComment(workspaceSlug, taskId);

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Comments</h3>
        <span className="text-xs text-muted-foreground">
          {comments.data?.reduce((n, c) => n + 1 + c.replies.length, 0) ?? 0}
        </span>
      </header>

      <CommentComposer
        onSubmit={(body) => create.mutate({ body })}
        isSubmitting={create.isPending}
        submitLabel="Comment"
        placeholder="Write a comment… @ to mention a teammate"
        workspaceSlug={workspaceSlug}
      />

      {comments.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : comments.error ? (
        <p className="text-xs text-muted-foreground">Failed to load comments.</p>
      ) : (comments.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {(comments.data ?? []).map((c) => (
            <CommentThread
              key={c.id}
              workspaceSlug={workspaceSlug}
              taskId={taskId}
              comment={c}
              currentUserId={currentUserId}
              workspaceRole={workspaceRole}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentThread({
  workspaceSlug,
  taskId,
  comment,
  currentUserId,
  workspaceRole,
}: {
  workspaceSlug: string;
  taskId: string;
  comment: ThreadedCommentResponse;
  currentUserId: string | undefined;
  workspaceRole: CommentsPanelProps['workspaceRole'];
}) {
  const [replying, setReplying] = useState(false);
  const create = useCreateComment(workspaceSlug, taskId);

  return (
    <li className="space-y-2">
      <CommentRow
        workspaceSlug={workspaceSlug}
        taskId={taskId}
        comment={comment}
        currentUserId={currentUserId}
        workspaceRole={workspaceRole}
        onReply={() => setReplying(true)}
        canReply
      />

      {comment.replies.length > 0 || replying ? (
        <ul className="space-y-2 border-l pl-4">
          {comment.replies.map((r) => (
            <CommentRow
              key={r.id}
              workspaceSlug={workspaceSlug}
              taskId={taskId}
              comment={r}
              currentUserId={currentUserId}
              workspaceRole={workspaceRole}
              canReply={false}
            />
          ))}
          {replying ? (
            <li>
              <CommentComposer
                autoFocus
                onSubmit={(body) => {
                  create.mutate(
                    { body, parentCommentId: comment.id },
                    { onSuccess: () => setReplying(false) },
                  );
                }}
                onCancel={() => setReplying(false)}
                isSubmitting={create.isPending}
                submitLabel="Reply"
                placeholder="Write a reply… @ to mention a teammate"
                workspaceSlug={workspaceSlug}
              />
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

function CommentRow({
  workspaceSlug,
  taskId,
  comment,
  currentUserId,
  workspaceRole,
  canReply,
  onReply,
}: {
  workspaceSlug: string;
  taskId: string;
  comment: CommentResponse;
  currentUserId: string | undefined;
  workspaceRole: CommentsPanelProps['workspaceRole'];
  canReply: boolean;
  onReply?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateComment(workspaceSlug, taskId);
  const remove = useDeleteComment(workspaceSlug, taskId);

  const isAuthor = comment.author.id === currentUserId;
  const isModerator = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
  const canEdit = isAuthor;
  const canDelete = isAuthor || isModerator;

  return (
    <div className="group/comment flex gap-2">
      <Avatar className="h-7 w-7 shrink-0">
        {comment.author.avatarUrl ? (
          <AvatarImage src={comment.author.avatarUrl} alt={comment.author.fullName} />
        ) : null}
        <AvatarFallback className="text-[10px]">{initials(comment.author.fullName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline gap-2 text-xs">
          <span className="font-medium">{comment.author.fullName}</span>
          <span className="text-muted-foreground">{formatRelative(comment.createdAt)}</span>
          {comment.updatedAt !== comment.createdAt ? (
            <span className="text-muted-foreground">(edited)</span>
          ) : null}
        </div>

        {editing ? (
          <CommentComposer
            autoFocus
            initialBody={comment.body}
            onSubmit={(body) => {
              update.mutate(
                { commentId: comment.id, body },
                { onSuccess: () => setEditing(false) },
              );
            }}
            onCancel={() => setEditing(false)}
            isSubmitting={update.isPending}
            submitLabel="Save"
            placeholder="Edit your comment…"
            workspaceSlug={workspaceSlug}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm">
            <MentionText body={comment.body} />
          </p>
        )}

        {!editing ? (
          <div
            className={cn(
              'flex items-center gap-1 opacity-0 transition-opacity',
              'group-hover/comment:opacity-100 focus-within:opacity-100',
            )}
          >
            {canReply && onReply ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onReply}
                className="gap-1 text-[10px]"
              >
                <Reply className="h-3 w-3" />
                Reply
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setEditing(true)}
                className="gap-1 text-[10px]"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  if (typeof window !== 'undefined' && !window.confirm('Delete this comment?'))
                    return;
                  remove.mutate(comment.id);
                }}
                disabled={remove.isPending}
                className="gap-1 text-[10px]"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function initials(text: string): string {
  const parts = text.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const nowMs = Date.now();
  const diff = Math.max(0, nowMs - d);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
