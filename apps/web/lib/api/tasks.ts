import { api } from '../api';
import type { Priority, TaskResponse } from './types';

export interface TaskListQuery {
  q?: string;
  statusIds?: string[];
  priority?: Priority[];
  labelIds?: string[];
  assigneeIds?: string[];
  projectId?: string | 'none';
  parentTaskId?: string | 'any';
  dueBefore?: string;
  dueAfter?: string;
}

export interface CreateTaskInput {
  title: string;
  statusId: string;
  projectId?: string | null;
  parentTaskId?: string | null;
  priority?: Priority;
  description?: string;
  startDate?: string;
  dueDate?: string;
  orderInColumn?: number;
  assigneeIds?: string[];
  labelIds?: string[];
}

export async function listTasks(slug: string, query: TaskListQuery = {}): Promise<TaskResponse[]> {
  const { data } = await api.get<TaskResponse[]>(`/workspaces/${slug}/tasks`, {
    params: query,
    // axios serialises arrays as `?statusIds=a&statusIds=b` by default, which
    // is what NestJS ValidationPipe expects for repeated query params.
    paramsSerializer: { indexes: null },
  });
  return data;
}

export async function createTask(slug: string, input: CreateTaskInput): Promise<TaskResponse> {
  const { data } = await api.post<TaskResponse>(`/workspaces/${slug}/tasks`, input);
  return data;
}

/**
 * PATCH body for /workspaces/:slug/tasks/:id. Every field is optional —
 * matches the backend's UpdateTaskDto. `null` on projectId / dueDate /
 * startDate means "clear the field"; `undefined` (omitted) means "no
 * change". assigneeIds / labelIds are declarative replacements when set.
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  statusId?: string;
  priority?: Priority;
  projectId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  orderInColumn?: number;
  assigneeIds?: string[];
  labelIds?: string[];
}

export async function updateTask(
  slug: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskResponse> {
  const { data } = await api.patch<TaskResponse>(`/workspaces/${slug}/tasks/${taskId}`, input);
  return data;
}
