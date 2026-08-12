'use client';

import { Check, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePreferencesStore, type BoardFieldsShown } from '@/lib/stores/preferences-store';

const FIELDS: Array<{ key: keyof BoardFieldsShown; label: string }> = [
  { key: 'priority', label: 'Priority' },
  { key: 'members', label: 'Members' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'labels', label: 'Labels' },
  { key: 'reporter', label: 'Reporter' },
];

/**
 * Fields dropdown for the board top bar. Toggles which meta fields appear on
 * BoardCard. Persists per-user in localStorage; server-side sync via
 * UserPreference.boardFieldsShown ships in a follow-up.
 */
export function FieldsDropdown() {
  const fields = usePreferencesStore((s) => s.boardFields);
  const toggle = usePreferencesStore((s) => s.toggleBoardField);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" />}
        aria-label="Fields shown on cards"
      >
        <Eye className="mr-1.5 h-4 w-4" />
        Fields
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Show on cards</p>
        {FIELDS.map((f) => (
          <DropdownMenuItem key={f.key} onClick={() => toggle(f.key)}>
            <span className="flex-1">{f.label}</span>
            {fields[f.key] ? <Check className="h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
