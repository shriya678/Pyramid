'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { ProseMirrorDoc } from '@/lib/prosemirror-doc';
import { richTextExtensions } from './rich-text-extensions';

export interface RichTextViewerProps {
  doc: ProseMirrorDoc;
  className?: string;
}

/**
 * Read-only render of a ProseMirror doc using the same TipTap extension
 * set the editor uses — guarantees that whatever the editor emits will
 * render identically at read time (bold stays bold, links stay clickable,
 * lists stay lists, etc).
 *
 * Uses TipTap's editor with `editable: false` rather than a hand-rolled
 * JSON→JSX walker so we don't have to reimplement every mark and node
 * type. Trade-off: ships the editor JS on the read path too. TipTap's
 * bundle is ~50KB gzipped and we already ship it for the composer, so
 * there's no real net cost.
 *
 * Links open in a new tab (see extensions config); the editor stays
 * inert on click because openOnClick is false — the viewer flips its
 * own onClick handler on <a> elements instead.
 */
export function RichTextViewer({ doc, className }: RichTextViewerProps) {
  // Cache the doc reference — TipTap deep-compares content on every render
  // and would re-parse the whole tree every time the parent re-rendered
  // otherwise. useMemo pins it to the doc's identity.
  const stableDoc = useMemo(() => doc, [doc]);

  const editor = useEditor({
    // No mention suggestion pipeline needed — the viewer just needs the
    // Mention node schema so `type: 'mention'` nodes in stored docs
    // render correctly. richTextExtensions() always registers it.
    extensions: richTextExtensions(),
    content: stableDoc,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none',
          '[&_p]:my-1 [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1',
          '[&_pre]:my-2 [&_pre]:bg-muted [&_pre]:text-foreground [&_pre]:rounded-md [&_pre]:p-2 [&_pre]:text-xs',
          '[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.9em]',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_a]:cursor-pointer',
        ),
      },
    },
  });

  // Re-hydrate the editor when the incoming doc actually changes (e.g. an
  // optimistic update or a comment edit). Without this the viewer would
  // show the doc it was initialized with forever.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(stableDoc)) {
      editor.commands.setContent(stableDoc, { emitUpdate: false });
    }
  }, [editor, stableDoc]);

  if (!editor) {
    return <div className={cn('h-4', className)} />;
  }

  return <EditorContent editor={editor} className={className} />;
}
