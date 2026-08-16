'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ExternalLink, File as FileIcon, Link as LinkIcon, Paperclip, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { extractErrorMessage } from '@/lib/api/error-message';
import type { ResourceResponse } from '@/lib/api/types';
import {
  useCreateResource,
  useDeleteResource,
  useResources,
  useResourceUrlFetcher,
  useUploadTaskFile,
} from '@/lib/hooks/use-board-data';

export interface ResourcesPanelProps {
  workspaceSlug: string;
  taskId: string;
  currentUserId: string | undefined;
  workspaceRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'COLLABORATOR';
}

/**
 * Attachments for a task — external LINKs and Cloudinary-hosted FILEs.
 *
 * Two add gestures:
 *   - "Add link" toggles inline URL + name form; posts a LINK Resource.
 *   - "Attach file" opens the native file picker; on select, hits the
 *     sign-upload endpoint, uploads bytes directly to Cloudinary, then
 *     records a FILE Resource with the returned public_id.
 *
 * Bytes never touch our API — Cloudinary receives them directly, and
 * we only store the key. Rendering a FILE hits GET /:id/url on demand
 * for a short-lived signed read URL.
 */
export function ResourcesPanel({
  workspaceSlug,
  taskId,
  currentUserId,
  workspaceRole,
}: ResourcesPanelProps) {
  const resources = useResources(workspaceSlug, taskId);
  const createLink = useCreateResource(workspaceSlug, taskId);
  const upload = useUploadTaskFile(workspaceSlug, taskId);
  const remove = useDeleteResource(workspaceSlug, taskId);
  const fetchFileUrl = useResourceUrlFetcher(workspaceSlug, taskId);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isModerator = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';

  const submitLink = (e: FormEvent) => {
    e.preventDefault();
    const url = linkUrl.trim();
    const name = linkName.trim() || url;
    if (!url) {
      setError('URL required');
      return;
    }
    setError(null);
    createLink.mutate(
      { type: 'LINK', name, url },
      {
        onSuccess: () => {
          setLinkOpen(false);
          setLinkUrl('');
          setLinkName('');
        },
        onError: (err) => setError(extractErrorMessage(err, 'Failed to add link')),
      },
    );
  };

  const onFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setError(null);
    upload.mutate(file, {
      onError: (err) => setError(extractErrorMessage(err, 'Upload failed')),
    });
  };

  const openFile = async (resource: ResourceResponse) => {
    if (resource.type === 'LINK') return;
    try {
      const { url } = await fetchFileUrl(resource.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to fetch file URL'));
    }
  };

  return (
    <section className="space-y-3">
      <header className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Resources</h3>
        <span className="text-xs text-muted-foreground">{resources.data?.length ?? 0}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setLinkOpen((v) => !v)}
            className="gap-1"
          >
            <LinkIcon className="h-3 w-3" />
            Add link
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={upload.isPending}
            className="gap-1"
          >
            <Paperclip className="h-3 w-3" />
            {upload.isPending ? 'Uploading…' : 'Attach file'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={onFileChosen}
            aria-hidden
          />
        </div>
      </header>

      {linkOpen ? (
        <form onSubmit={submitLink} className="rounded-md border p-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              autoFocus
              className="h-8 text-xs"
              aria-label="Link URL"
            />
            <Input
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              placeholder="Name (optional)"
              className="h-8 text-xs"
              aria-label="Link name"
            />
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLinkOpen(false);
                  setLinkUrl('');
                  setLinkName('');
                  setError(null);
                }}
                disabled={createLink.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createLink.isPending || !linkUrl.trim()}>
                {createLink.isPending ? 'Adding…' : 'Add'}
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>
      ) : null}

      {resources.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : resources.error ? (
        <p className="text-xs text-muted-foreground">Failed to load resources.</p>
      ) : (resources.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">No resources yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {(resources.data ?? []).map((r) => (
            <ResourceRow
              key={r.id}
              resource={r}
              canDelete={r.uploadedBy.id === currentUserId || isModerator}
              onOpen={() => openFile(r)}
              onDelete={() => {
                if (typeof window !== 'undefined' && !window.confirm(`Remove ${r.name}?`)) return;
                remove.mutate(r.id);
              }}
              isDeleting={remove.isPending && remove.variables === r.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ResourceRow({
  resource,
  canDelete,
  onOpen,
  onDelete,
  isDeleting,
}: {
  resource: ResourceResponse;
  canDelete: boolean;
  onOpen: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const isFile = resource.type === 'FILE';
  const commonBtn =
    'group/res flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-muted/40';

  return (
    <li className="flex items-center gap-1.5">
      {isFile ? (
        <button type="button" onClick={onOpen} className={commonBtn}>
          <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <ResourceMeta resource={resource} />
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/res:opacity-100" />
        </button>
      ) : (
        <a
          href={resource.url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className={commonBtn}
        >
          <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <ResourceMeta resource={resource} />
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/res:opacity-100" />
        </a>
      )}
      {canDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label={`Remove ${resource.name}`}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      ) : null}
    </li>
  );
}

function ResourceMeta({ resource }: { resource: ResourceResponse }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-xs font-medium">{resource.name}</span>
      <span className={cn('block truncate text-[10px] text-muted-foreground')}>
        {resource.type === 'FILE'
          ? formatBytes(resource.sizeBytes) + (resource.mimeType ? ` · ${resource.mimeType}` : '')
          : (resource.url ?? '')}
      </span>
    </span>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return 'file';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
