import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const ACCENT_COLORS = ['amber', 'blue', 'pink', 'rose', 'emerald', 'black'] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

/** Toggle-able card fields on the board. Server counterpart lives in
 *  UserPreference.boardFieldsShown; sync ships in a follow-up. */
export interface BoardFieldsShown {
  priority: boolean;
  members: boolean;
  dueDate: boolean;
  labels: boolean;
  reporter: boolean;
}

export const DEFAULT_BOARD_FIELDS: BoardFieldsShown = {
  priority: true,
  members: true,
  dueDate: true,
  labels: true,
  reporter: false,
};

interface PreferencesState {
  accent: AccentColor;
  boardFields: BoardFieldsShown;
  /** True once zustand has finished hydrating from localStorage on client mount. */
  hydrated: boolean;

  setAccent: (accent: AccentColor) => void;
  toggleBoardField: (field: keyof BoardFieldsShown) => void;
  setBoardFields: (fields: BoardFieldsShown) => void;
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
      boardFields: DEFAULT_BOARD_FIELDS,
      hydrated: false,

      setAccent: (accent) => set({ accent }),
      toggleBoardField: (field) =>
        set((s) => ({ boardFields: { ...s.boardFields, [field]: !s.boardFields[field] } })),
      setBoardFields: (fields) => set({ boardFields: fields }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'task-mgmt-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ accent: state.accent, boardFields: state.boardFields }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);
