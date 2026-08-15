import { api } from '../api';
import type { CloudinarySignedUpload, ResourceResponse, ResourceType } from './types';

export async function listResources(slug: string, taskId: string): Promise<ResourceResponse[]> {
  const { data } = await api.get<ResourceResponse[]>(
    `/workspaces/${slug}/tasks/${taskId}/resources`,
  );
  return data;
}

export async function signUpload(slug: string, taskId: string): Promise<CloudinarySignedUpload> {
  const { data } = await api.post<CloudinarySignedUpload>(
    `/workspaces/${slug}/tasks/${taskId}/resources/sign-upload`,
  );
  return data;
}

/** Shape mirrors the backend CreateResourceDto:
 *  - LINK: name + url required, cloudinaryKey null
 *  - FILE: name + cloudinaryKey required (after client upload), url null
 */
export interface CreateResourceInput {
  type: ResourceType;
  name: string;
  url?: string;
  cloudinaryKey?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export async function createResource(
  slug: string,
  taskId: string,
  input: CreateResourceInput,
): Promise<ResourceResponse> {
  const { data } = await api.post<ResourceResponse>(
    `/workspaces/${slug}/tasks/${taskId}/resources`,
    input,
  );
  return data;
}

/** Returns a fresh short-lived signed URL for a FILE resource. Frontend
 *  calls this on demand (e.g. when the user clicks the file link) and
 *  the returned URL is valid for ~5 minutes. */
export async function getResourceUrl(
  slug: string,
  taskId: string,
  resourceId: string,
): Promise<{ url: string }> {
  const { data } = await api.get<{ url: string }>(
    `/workspaces/${slug}/tasks/${taskId}/resources/${resourceId}/url`,
  );
  return data;
}

export async function deleteResource(
  slug: string,
  taskId: string,
  resourceId: string,
): Promise<{ ok: true }> {
  const { data } = await api.delete<{ ok: true }>(
    `/workspaces/${slug}/tasks/${taskId}/resources/${resourceId}`,
  );
  return data;
}
