import { api } from '../api';
import type { LabelResponse } from './types';

export async function listLabels(slug: string): Promise<LabelResponse[]> {
  const { data } = await api.get<LabelResponse[]>(`/workspaces/${slug}/labels`);
  return data;
}
