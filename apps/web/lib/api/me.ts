import { api } from '../api';
import type { AuthUser } from '../stores/auth-store';

export interface UpdateMeInput {
  fullName?: string;
  username?: string;
  /** Nullable — pass null to clear, undefined to leave alone. */
  title?: string | null;
  /** Nullable — pass null to clear, undefined to leave alone. */
  avatarUrl?: string | null;
}

/**
 * PATCH /auth/me. Only the fields present on the input are touched by the
 * backend. Sensitive fields (email, googleId, isGuest) are deliberately
 * omitted from this endpoint's DTO — they change via dedicated flows.
 */
export async function updateMe(input: UpdateMeInput): Promise<AuthUser> {
  const { data } = await api.patch<AuthUser>('/auth/me', input);
  return data;
}
