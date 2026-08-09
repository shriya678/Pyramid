// Minimal fetch wrapper for the hello-world page.
// Grows into the full API client in later PRs (auth token, silent refresh, etc.).

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type HealthResponse = {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  dbLatencyMs: number | null;
  uptimeSeconds: number;
  env: string;
  timestamp: string;
};

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE_URL}/health`, {
    // Don't let Next.js cache this. We want a live probe.
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Health check failed: HTTP ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}

export const apiConfig = {
  baseUrl: BASE_URL,
} as const;
