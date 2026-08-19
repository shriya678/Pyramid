import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ResizableImageView } from './resizable-image-view';

/**
 * TipTap Image extension extended with a `width` attribute so users can
 * pick a display size (25/50/75/100%). Uses ReactNodeViewRenderer so
 * ResizableImageView owns the presentational shell + the size toolbar.
 *
 * The default @tiptap/extension-image renders a bare <img> — no way to
 * store per-image width, no NodeView, no resize UI. Extending it here
 * keeps the base schema (src, alt, title) intact and adds only what we
 * need.
 */
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        // Parse from the wrapper's inline style so a round-tripped doc
        // (viewer render → editor edit) preserves the chosen width.
        parseHTML: (element) => element.getAttribute('data-width') ?? '100%',
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { 'data-width': attributes.width as string };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
