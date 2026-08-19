'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { cn } from '@/lib/utils';

/** Width presets (as CSS percentage strings). Keep in sync with UI toolbar below. */
const SIZE_PRESETS = ['25%', '50%', '75%', '100%'] as const;

/**
 * Renders an image inside the ProseMirror doc with a small toolbar overlay
 * that lets the user pick a width. `width` is stored on the node's attrs
 * so the choice round-trips through the doc — reads render at the chosen
 * width without any resize UI.
 *
 * We intentionally don't do drag-handle resize:
 *   - Drag handles need pointer capture inside a contenteditable, which
 *     fights with ProseMirror's own selection model.
 *   - Preset percentages are what users actually reach for 90% of the
 *     time (thumbnail vs full-width); the free-drag range in between is
 *     rarely worth the complexity.
 *   - Full-width is the default so simple pastes still look right without
 *     touching this UI.
 */
export function ResizableImageView(props: NodeViewProps) {
  const { node, updateAttributes, selected, editor } = props;
  const src = node.attrs.src as string | undefined;
  const alt = (node.attrs.alt as string | undefined) ?? '';
  const width = (node.attrs.width as string | undefined) ?? '100%';
  const isEditable = editor.isEditable;

  if (!src) return null;

  return (
    <NodeViewWrapper
      className={cn(
        'group/img relative my-2 inline-block max-w-full',
        selected && isEditable ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : '',
      )}
      style={{ width }}
      // data-drag-handle lets ProseMirror treat the whole wrapper as the
      // drag source when the user drags within the editor.
      data-drag-handle=""
    >
      {/* Plain <img>, not next/image — Cloudinary URLs are dynamic
          per-comment and unknown to Next at build time; next/image would
          need a runtime loader and adds no meaningful benefit for
          user-uploaded content that's already served from a CDN. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className="block h-auto w-full rounded-md" />
      {/* Toolbar only appears in edit mode; viewer is inert */}
      {isEditable ? (
        <div
          className={cn(
            'absolute -top-8 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-md border bg-popover px-1 py-0.5 text-[10px] shadow-md',
            // Show on hover OR when the image node is selected — otherwise
            // the toolbar hides so it doesn't distract while reading.
            'opacity-0 transition-opacity',
            'group-hover/img:opacity-100',
            selected ? 'opacity-100' : '',
          )}
          contentEditable={false}
        >
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => updateAttributes({ width: preset })}
              className={cn(
                'rounded px-1.5 py-0.5 font-medium transition-colors',
                width === preset
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              aria-pressed={width === preset}
            >
              {preset}
            </button>
          ))}
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}
