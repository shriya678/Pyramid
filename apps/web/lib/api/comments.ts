import { api } from '../api';
import type { CommentResponse, ThreadedCommentResponse } from './types';

export async function listComments(
  slug: string,
  taskId: string,
): Promise<ThreadedCommentResponse[]> {
  const { data } = await api.get<ThreadedCommentResponse[]>(
    `/workspaces/${slug}/tasks/${taskId}/comments`,
  );
  return data;
}

export interface CreateCommentInput {
  body: string;
  parentCommentId?: string;
}

export async function createComment(
  slug: string,
  taskId: string,
  input: CreateCommentInput,
): Promise<CommentResponse> {
  const { data } = await api.post<CommentResponse>(
    `/workspaces/${slug}/tasks/${taskId}/comments`,
    input,
  );
  return data;
}

export async function updateComment(
  slug: string,
  taskId: string,
  commentId: string,
  body: string,
): Promise<CommentResponse> {
  const { data } = await api.patch<CommentResponse>(
    `/workspaces/${slug}/tasks/${taskId}/comments/${commentId}`,
    { body },
  );
  return data;
}

export async function deleteComment(
  slug: string,
  taskId: string,
  commentId: string,
): Promise<{ ok: true }> {
  const { data } = await api.delete<{ ok: true }>(
    `/workspaces/${slug}/tasks/${taskId}/comments/${commentId}`,
  );
  return data;
}
