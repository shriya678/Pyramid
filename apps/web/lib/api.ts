import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore, type AuthTokens } from './stores/auth-store';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type HealthResponse = {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  dbLatencyMs: number | null;
  uptimeSeconds: number;
  env: string;
  timestamp: string;
};

/**
 * Kept for the (soon-to-be-removed) hello-world page. New code should use the
 * `api` instance below.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE_URL}/health`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
  return (await res.json()) as HealthResponse;
}

export const apiConfig = { baseUrl: BASE_URL } as const;

// -----------------------------------------------------------------------------
// Axios instance with silent-refresh interceptor
// -----------------------------------------------------------------------------

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

/** Attach the current access token from the store on every request. */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

// -----------------------------------------------------------------------------
// Silent refresh
// -----------------------------------------------------------------------------
//
// One shared refresh promise so N concurrent 401s only trigger ONE POST
// /auth/refresh — the others queue for its result. Without this, a page that
// fires 5 parallel queries when the token has just expired ends up rotating
// the refresh token 5 times and 4 of them get revoked immediately.

let refreshInFlight: Promise<AuthTokens> | null = null;

async function refreshTokensOnce(): Promise<AuthTokens> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) throw new Error('no refresh token');

  // Fresh axios call (not `api`) so we don't recurse through this same interceptor.
  const res = await axios.post<AuthTokens>(
    `${BASE_URL}/auth/refresh`,
    { refreshToken },
    { headers: { 'Content-Type': 'application/json' } },
  );
  useAuthStore.getState().updateTokens(res.data);
  return res.data;
}

function refreshTokens(): Promise<AuthTokens> {
  if (!refreshInFlight) {
    refreshInFlight = refreshTokensOnce().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

interface RetryableRequest extends InternalAxiosRequestConfig {
  _retryAfterRefresh?: boolean;
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as RetryableRequest | undefined;
    // Only handle 401s on requests we haven't already retried.
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retryAfterRefresh ||
      // Refresh endpoint itself failing means the refresh token is gone —
      // bail out to /login instead of looping.
      original.url?.includes('/auth/refresh')
    ) {
      return Promise.reject(error);
    }

    try {
      const tokens = await refreshTokens();
      original._retryAfterRefresh = true;
      original.headers = original.headers ?? {};
      (original.headers as Record<string, string>).Authorization = `Bearer ${tokens.accessToken}`;
      return api.request(original);
    } catch (refreshErr) {
      // Refresh failed → session is gone. Clear locally and hard-redirect
      // to /login. Hard nav so React state resets cleanly.
      useAuthStore.getState().clear();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return Promise.reject(refreshErr as Error);
    }
  },
);

export { api };
