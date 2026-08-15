/* eslint-disable react-hooks/refs -- assigning `saveRef.current = save`
   during render is a deliberate "latest ref" pattern to avoid re-firing
   the debounce effect on every parent render. The React 19 rule flags
   it defensively; the pattern is safe (write-only, never read during
   render). */

import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from './use-debounced-value';

/**
 * Local-first field with a debounced auto-save to the server.
 *
 * Usage:
 *   const [title, setTitle] = useAutosaveField(task.title, (v) =>
 *     updateTask.mutate({ taskId, input: { title: v } })
 *   );
 *
 *   <input value={title} onChange={(e) => setTitle(e.target.value)} />
 *
 * Contract:
 *   - Returns [value, setValue] like useState, so the input is fully controlled.
 *   - Fires `save` when the debounced value changes AND differs from the last
 *     server value we saw. The initial mount does not fire — that would
 *     cause a spurious PATCH on every load.
 *   - If the server value changes underneath us (e.g. someone else updated
 *     the task, or a mutation returned an authoritative row), the local
 *     value snaps to it as long as the user hasn't started editing yet.
 *     Once the user has diverged, remote changes are ignored until the
 *     local save catches up — otherwise typing gets stomped on refetch.
 */
export function useAutosaveField<T>(
  serverValue: T,
  save: (next: T) => void,
  delayMs = 500,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(serverValue);
  const debounced = useDebouncedValue(value, delayMs);
  const lastSavedRef = useRef<T>(serverValue);
  // `save` is often a fresh arrow each render; capture the latest without
  // making it a dep so we don't re-run the save effect just because the
  // parent re-rendered.
  const saveRef = useRef(save);
  saveRef.current = save;

  // Snap local value to server if the user hasn't touched it. Comparison
  // with lastSavedRef lets us detect "server changed under us" from "local
  // change we made". If server changed AND local matches lastSaved, snap.
  useEffect(() => {
    if (value === lastSavedRef.current && serverValue !== lastSavedRef.current) {
      lastSavedRef.current = serverValue;
      setValue(serverValue);
    } else if (serverValue === value) {
      // Optimistic patch or successful save round-trip landed — advance the
      // baseline so we don't re-save the same value.
      lastSavedRef.current = serverValue;
    }
    // Intentionally omit `value` from deps — we only care about server-side
    // changes here. Including it would fight with the typing user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverValue]);

  // Fire save when the debounced local value differs from what's saved.
  useEffect(() => {
    if (debounced === lastSavedRef.current) return;
    lastSavedRef.current = debounced;
    saveRef.current(debounced);
  }, [debounced]);

  return [value, setValue];
}
