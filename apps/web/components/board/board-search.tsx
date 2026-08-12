'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

export interface BoardSearchProps {
  /** Initial value — parent owns the debounced result via onChange. */
  initialValue?: string;
  /** Called with the debounced (300 ms) input value after the user stops typing. */
  onChange: (q: string) => void;
}

/**
 * Compact search box for the board top bar. Local state for the raw input,
 * a 300 ms debounce before it bubbles up to trigger a new /tasks query.
 */
export function BoardSearch({ initialValue = '', onChange }: BoardSearchProps) {
  const [raw, setRaw] = useState(initialValue);
  const debounced = useDebouncedValue(raw, 300);

  useEffect(() => {
    onChange(debounced);
    // onChange is intentionally not in deps — parents pass inline arrow fns
    // and re-triggering on every render would defeat the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className="relative w-36 shrink-0 md:w-56">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Search tasks"
        className="h-8 pl-7 pr-7 text-sm"
        aria-label="Search tasks"
      />
      {raw && (
        <button
          type="button"
          onClick={() => setRaw('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:bg-muted"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
