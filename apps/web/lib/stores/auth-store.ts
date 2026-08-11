import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  title: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
}

export interface AuthWorkspace {
  id: string;
  slug: string;
  name: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface AuthPayload extends AuthTokens {
  user: AuthUser;
  workspace: AuthWorkspace;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  workspace: AuthWorkspace | null;
  /** true after zustand has finished hydrating from localStorage on client mount. */
  hydrated: boolean;

  setSession: (payload: AuthPayload) => void;
  updateTokens: (tokens: AuthTokens) => void;
  clear: () => void;
  markHydrated: () => void;
}

/**
 * Single source of truth for the client-side session. Persists to localStorage
 * so a page reload keeps the user signed in. Read via `useAuthStore()` inside
 * client components; the axios interceptor reads via `useAuthStore.getState()`.
 *
 * SSR/hydration: `persist` middleware waits for client-side mount to rehydrate.
 * Until `hydrated` flips to true, callers should render a neutral loading
 * state — otherwise the server-rendered HTML (empty auth) will flash before
 * the client swaps in the persisted state.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      workspace: null,
      hydrated: false,

      setSession: (payload) =>
        set({
          accessToken: payload.accessToken,
          refreshToken: payload.refreshToken,
          user: payload.user,
          workspace: payload.workspace,
        }),

      updateTokens: (tokens) =>
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        }),

      clear: () => set({ accessToken: null, refreshToken: null, user: null, workspace: null }),

      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'task-mgmt-auth',
      storage: createJSONStorage(() => localStorage),
      // Skip persisting `hydrated` — it's a runtime flag, not part of the session.
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        workspace: state.workspace,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);
