import { AxiosError } from 'axios';

/**
 * Extract the most useful human-readable message from a mutation error.
 *
 * The naive `err instanceof Error ? err.message` swallows backend detail —
 * an AxiosError IS an Error, but `err.message` is only "Request failed with
 * status code 400", not the JSON body's `message` field (which is where
 * class-validator and thrown HttpExceptions land).
 *
 * Order of preference:
 *   1. AxiosError → response.data.message (unwrapping single-element arrays
 *      from class-validator's default output)
 *   2. AxiosError → response.data.error (fallback for weirder shapes)
 *   3. AxiosError → err.message (network error, no response body)
 *   4. Any Error → err.message
 *   5. `fallback` (last resort — the caller supplies context-aware copy)
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const body = err.response?.data as { message?: unknown; error?: unknown } | undefined;
    const msg = body?.message;
    if (Array.isArray(msg) && msg.length > 0) return String(msg[0]);
    if (typeof msg === 'string' && msg) return msg;
    if (typeof body?.error === 'string' && body.error) return body.error;
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
