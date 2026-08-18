/**
 * Extract @username tokens from a comment body.
 *
 * Regex mirrors the frontend's MentionText renderer exactly so backend and
 * frontend agree on what counts as a mention. Username shape matches the
 * User.username DTO — lowercase letters, digits, dashes; 1-40 chars.
 *
 * The leading capture `(^|[^\w@])` ensures we don't match inside email
 * addresses (`user@host`) or inside a longer word (`priya@team.com`
 * won't fire for `team`).
 *
 * Returns unique lowercase usernames in the order they appear. Duplicates
 * within one comment collapse to one entry — no reason to send someone
 * five notifications for one comment.
 */
const MENTION_PATTERN = /(^|[^\w@])@([\w-]{1,40})/g;

export function extractMentionedUsernames(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const raw = match[2];
    if (!raw) continue;
    const name = raw.toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
