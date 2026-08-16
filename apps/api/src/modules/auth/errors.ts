/**
 * Sentinel thrown by AuthService.handleGoogleLogin when a merge is blocked
 * because the Google account already belongs to a different real
 * (non-guest) user. Caught by AuthController.googleCallback so it can
 * redirect the browser with `?error=merge_conflict` instead of surfacing
 * a 500.
 *
 * Lives in its own file so both service and controller can import it
 * without a circular dependency.
 */
export class MergeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MergeConflictError';
  }
}

export function isMergeConflict(err: unknown): err is MergeConflictError {
  return err instanceof MergeConflictError;
}
