/**
 * Shape returned by /auth/guest (and later /auth/google/callback). The client
 * stores tokens in localStorage and uses `user` + `workspace` to render the
 * shell immediately without waiting for a follow-up /auth/me + /workspaces call.
 */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    fullName: string;
    title: string | null;
    avatarUrl: string | null;
    isGuest: boolean;
  };
  workspace: {
    id: string;
    slug: string;
    name: string;
  };
}

/** Response for POST /auth/refresh — tokens only, no user reload. */
export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}
