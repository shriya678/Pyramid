'use client';

import { ReactRenderer } from '@tiptap/react';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { useMemo } from 'react';
import { useWorkspaceMembers } from '@/lib/hooks/use-board-data';
import {
  MentionSuggestionList,
  toMentionItems,
  type MentionItem,
  type MentionSuggestionListHandle,
} from './mention-suggestion-list';

/**
 * Wires the TipTap Mention extension's suggestion pipeline for the
 * comment composer:
 *   - Loads workspace members via TanStack Query (already cached by
 *     the rest of the app; opening the picker doesn't trigger a new
 *     fetch on warm caches).
 *   - Filters against the current query (case-insensitive, matches
 *     username OR fullName so users can find teammates by either).
 *   - Mounts the MentionSuggestionList popover under the caret using
 *     a plain absolutely-positioned div (no tippy.js dep).
 *
 * When the user picks an item, TipTap inserts a `type: 'mention'` node
 * carrying `attrs.id = userId` and `attrs.label = username`. Backend
 * mention emitter walks the doc for these nodes and delivers
 * notifications by userId — no more regex-on-plain-text guessing.
 */
export function useMentionSuggestion(
  workspaceSlug: string,
): Omit<SuggestionOptions<MentionItem>, 'editor'> {
  const members = useWorkspaceMembers(workspaceSlug);
  const allItems = useMemo(() => toMentionItems(members.data ?? []), [members.data]);

  // The suggestion config is captured once per allItems reference — safe
  // because `items()` closes over the latest allItems via the closure.
  return useMemo(() => {
    return {
      items: ({ query }: { query: string }) => {
        const q = query.toLowerCase().trim();
        const filtered = q
          ? allItems.filter(
              (it) => it.label.toLowerCase().includes(q) || it.fullName.toLowerCase().includes(q),
            )
          : allItems;
        // Cap the dropdown at 8 rows so a huge workspace doesn't spill
        // beyond the viewport.
        return filtered.slice(0, 8);
      },
      // Popover lifecycle — TipTap fires these as the user types after @.
      render: () => {
        let component: ReactRenderer<MentionSuggestionListHandle> | null = null;
        let popup: HTMLDivElement | null = null;

        return {
          onStart: (props) => {
            component = new ReactRenderer(MentionSuggestionList, {
              props,
              editor: props.editor,
            });
            if (!props.clientRect) return;
            popup = document.createElement('div');
            popup.style.position = 'absolute';
            popup.style.zIndex = '60';
            popup.appendChild(component.element);
            document.body.appendChild(popup);
            positionAtCaret(popup, props.clientRect);
          },
          onUpdate: (props) => {
            component?.updateProps(props);
            if (popup && props.clientRect) {
              positionAtCaret(popup, props.clientRect);
            }
          },
          onKeyDown: (props) => {
            if (props.event.key === 'Escape') {
              popup?.remove();
              popup = null;
              return true;
            }
            return component?.ref?.onKeyDown(props.event) ?? false;
          },
          onExit: () => {
            popup?.remove();
            popup = null;
            component?.destroy();
            component = null;
          },
        };
      },
    };
  }, [allItems]);
}

/**
 * Position a floating popup below the caret. TipTap gives us a
 * `clientRect` accessor for the current selection range; we anchor
 * below-left and flip above if there isn't room below.
 */
function positionAtCaret(popup: HTMLDivElement, getRect: () => DOMRect | null) {
  const rect = getRect();
  if (!rect) return;
  const margin = 4;
  const popupHeight = popup.offsetHeight || 200; // best-effort before layout
  const flipAbove = rect.bottom + popupHeight + margin > window.innerHeight;
  popup.style.top = `${
    flipAbove
      ? rect.top + window.scrollY - popupHeight - margin
      : rect.bottom + window.scrollY + margin
  }px`;
  popup.style.left = `${rect.left + window.scrollX}px`;
}
