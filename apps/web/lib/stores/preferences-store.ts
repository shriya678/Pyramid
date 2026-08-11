import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const ACCENT_COLORS = ['amber', 'blue', 'pink', 'rose', 'emerald', 'black'] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

interface PreferencesState {
  accent: AccentColor;
  /** True once zustand has finished hydrating from localStorage on client mount. */
  hydrated: boolean;

  setAccent: (accent: AccentColor) => void;
  markHydrated: () => void;
}

/**
 * UI preferences that live purely on the client — no server calls.
 *
 * `accent` also has a server counterpart (UserPreference.accentColor) but the
 * client is the source of truth for immediacy; the server value is synced by
 * the Settings screen when it ships. On login the server value can be pushed
 * into this store to hydrate cross-device.
 *
 * `theme` (light/dark) is handled by next-themes separately — it has its own
 * localStorage-driven flash-free hydration story, no need to duplicate here.
 */
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      accent: 'blue',
      hydrated: false,

      setAccent: (accent) => set({ accent }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'task-mgmt-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ accent: state.accent }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);
