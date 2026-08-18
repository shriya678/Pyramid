import { api } from '../api';
import type { LabelResponse } from './types';

export async function listLabels(slug: string): Promise<LabelResponse[]> {
  const { data } = await api.get<LabelResponse[]>(`/workspaces/${slug}/labels`);
  return data;
}

export interface CreateLabelInput {
  name: string;
  color: string;
}

/**
 * Create a new workspace label. Backend enforces:
 *   - unique name per workspace (409 on duplicate)
 *   - 6-digit hex color (400 on bad format)
 */
export async function createLabel(slug: string, input: CreateLabelInput): Promise<LabelResponse> {
  const { data } = await api.post<LabelResponse>(`/workspaces/${slug}/labels`, input);
  return data;
}
