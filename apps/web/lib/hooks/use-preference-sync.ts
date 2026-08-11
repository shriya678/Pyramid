'use client';

import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { usePreferencesStore, type AccentColor } from '@/lib/stores/preferences-store';

interface ServerPreferences {
  theme: 'LIGHT' | 'DARK';
  accentColor: 'AMBER' | 'BLUE' | 'PINK' | 'ROSE' | 'EMERALD' | 'BLACK';
  defaultView: 'BOARD' | 'LIST';
}

const SERVER_TO_ACCENT: Record<ServerPreferences['accentColor'], AccentColor> = {
  AMBER: 'amber',
  BLUE: 'blue',
  PINK: 'pink',
  ROSE: 'rose',
  EMERALD: 'emerald',
  BLACK: 'black',
};
const ACCENT_TO_SERVER: Record<AccentColor, ServerPreferences['accentColor']> = {
  amber: 'AMBER',
  blue: 'BLUE',
  pink: 'PINK',
  rose: 'ROSE',
  emerald: 'EMERALD',
  black: 'BLACK',
};

/**
 * Two-way sync between the client stores (next-themes + Zustand accent) and
 * the server-side UserPreference row.
 *
 *   On first mount:  GET /me/preferences → push server values into the stores
 *                    (so a user who signed in on device A and picked Dark sees
 *                     Dark on device B when they sign in).
 *   On any change:   debounced PATCH /me/preferences ← push local changes
 *
 * We skip the first PATCH after the initial GET to avoid a redundant round
 * trip (server just told us its state; no reason to send it back).
 */
export function usePreferenceSync(): void {
  const { theme, setTheme } = useTheme();
  const accent = usePreferencesStore((s) => s.accent);
  const setAccent = usePreferencesStore((s) => s.setAccent);
  const authHydrated = usePreferencesStore((s) => s.hydrated);

  const initialLoadDone = useRef(false);
  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load — one-shot, after zustand + next-themes are ready.
  useEffect(() => {
    if (!authHydrated || initialLoadDone.current) return;
    initialLoadDone.current = true;

    api
      .get<ServerPreferences>('/me/preferences')
      .then((res) => {
        const serverTheme = res.data.theme === 'DARK' ? 'dark' : 'light';
        // Only override next-themes if the user hasn't already picked something
        // this session — otherwise the initial GET clobbers their local click.
        if (theme !== serverTheme) setTheme(serverTheme);

        const serverAccent = SERVER_TO_ACCENT[res.data.accentColor];
        if (serverAccent && serverAccent !== accent) setAccent(serverAccent);
      })
      .catch(() => {
        // If the API is down or the user isn't signed in yet, silently ignore.
        // Local defaults still work.
      });
    // Intentionally not depending on `theme` / `accent` — this is a one-shot
    // fetch on mount, not a subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHydrated]);

  // Push local changes to server (debounced).
  useEffect(() => {
    if (!initialLoadDone.current) return;
    if (pendingSaveTimer.current) clearTimeout(pendingSaveTimer.current);

    pendingSaveTimer.current = setTimeout(() => {
      const body: Partial<ServerPreferences> = {
        theme: theme === 'dark' ? 'DARK' : 'LIGHT',
        accentColor: ACCENT_TO_SERVER[accent],
      };
      api.patch('/me/preferences', body).catch(() => {
        // Best-effort save; a failure here just means the choice doesn't
        // follow the user to another device. Local UI is unaffected.
      });
    }, 400);

    return () => {
      if (pendingSaveTimer.current) clearTimeout(pendingSaveTimer.current);
    };
  }, [theme, accent]);
}
