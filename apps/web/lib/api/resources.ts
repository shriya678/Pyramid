import { api } from '../api';
import type { CloudinarySignedUpload, ResourceResponse, ResourceType } from './types';

/**
 * Public Cloudinary upload params for an inline image (comment paste /
 * drop / picker). URL returned by Cloudinary lives in the ProseMirror
 * doc as an <img src> and needs to work without server-side re-signing.
 */
export interface CloudinarySignedInlineImage {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  uploadUrl: string;
  resourceType: 'image';
  type: 'upload';
}

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

/**
 * Sign a public-mode Cloudinary upload for an inline image pasted into
 * a comment. Frontend then POSTs the image blob directly to Cloudinary
 * and receives a permanent public URL to embed in the ProseMirror doc.
 */
export async function signInlineImageUpload(
  slug: string,
  taskId: string,
): Promise<CloudinarySignedInlineImage> {
  const { data } = await api.post<CloudinarySignedInlineImage>(
    `/workspaces/${slug}/tasks/${taskId}/resources/sign-inline-image`,
  );
  return data;
}

/**
 * End-to-end helper: sign, upload a blob to Cloudinary, return the
 * public secure_url. Used by the comment composer's paste/drop handler
 * and its toolbar image button.
 *
 * The upload happens direct browser → Cloudinary (no proxy through our
 * API), so we don't pay bandwidth for the image bytes.
 */
export async function uploadInlineImage(
  slug: string,
  taskId: string,
  file: File | Blob,
): Promise<{ url: string; publicId: string; width?: number; height?: number }> {
  const signed = await signInlineImageUpload(slug, taskId);
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signed.apiKey);
  formData.append('timestamp', String(signed.timestamp));
  formData.append('signature', signed.signature);
  formData.append('folder', signed.folder);

  const res = await fetch(signed.uploadUrl, { method: 'POST', body: formData });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cloudinary upload failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    secure_url: string;
    public_id: string;
    width?: number;
    height?: number;
  };
  return {
    url: json.secure_url,
    publicId: json.public_id,
    width: json.width,
    height: json.height,
  };
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
