'use client';

import type { Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from 'lucide-react';
import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Fixed toolbar row rendered above the RichTextEditor's content area.
 * Every button dispatches through `editor.chain().focus()` so the editor
 * regains focus after the button click (otherwise the toolbar would
 * "steal" focus and users would have to click back into the content).
 *
 * Toggles show an active state via `editor.isActive('markOrNode')` — this
 * is how a user knows they're currently inside a code block, list, etc,
 * and can click the same button again to exit. Solves the "no way to
 * close a code block" complaint from QA.
 */
export function RichTextToolbar({
  editor,
  onImageUpload,
}: {
  editor: Editor | null;
  /** Optional — when provided, an "Insert image" button opens a file
   *  picker that uploads via this handler and inserts the resulting URL. */
  onImageUpload?: (file: File | Blob) => Promise<{ url: string; width?: number }>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImagePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the input value so picking the same file twice still fires
    // onChange — otherwise the browser dedups and users hit a dead click.
    e.target.value = '';
    if (!file || !onImageUpload || !editor) return;
    try {
      const { url } = await onImageUpload(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      // Toolbar image-pick error; user will retry.
      console.error('inline image upload failed', err);
    }
  };

  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1">
      <Group>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          label="Bold (Ctrl/Cmd+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          label="Italic (Ctrl/Cmd+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          label="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive('code')}
          label="Inline code (Ctrl/Cmd+E)"
        >
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>
      </Group>

      <Divider />

      <Group>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          label="Heading 1"
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          label="Heading 2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          label="Heading 3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </Group>

      <Divider />

      <Group>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          label="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          label="Numbered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          label="Blockquote"
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive('codeBlock')}
          label="Code block (click again to exit)"
        >
          <Code2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </Group>

      {/* Image group only rendered when an uploader is wired — viewer +
          composers without a workspace context skip it entirely. */}
      {onImageUpload ? (
        <>
          <Divider />
          <Group>
            <ToolbarButton
              onClick={() => fileInputRef.current?.click()}
              isActive={false}
              label="Insert image (or paste / drag one into the editor)"
            >
              <ImageIcon className="h-3.5 w-3.5" />
            </ToolbarButton>
          </Group>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImagePick}
          />
        </>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  onClick,
  isActive,
  label,
  children,
}: {
  onClick: () => void;
  isActive: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />;
}
