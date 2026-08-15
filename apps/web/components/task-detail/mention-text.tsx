/**
 * Renders comment body with @username tokens wrapped in a highlighted span.
 * Pure client-side render — no notifications are delivered, matching the
 * "highlight-only" scope. If we ever wire mention → workspace-member
 * lookup, this component becomes the natural place to add hover cards.
 *
 * Regex matches @word where word = letters/digits/dash/underscore, up to
 * 40 chars (same shape the backend permits on User.username). Preceded
 * by start-of-string or non-word so we don't mangle `user@host`. Uses
 * matchAll to avoid mutating the regex's lastIndex — React 19's compiler
 * rules reject module-level state mutation during render.
 */
const MENTION_PATTERN = /(^|[^\w@])@([\w-]{1,40})/g;

export function MentionText({ body }: { body: string }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of body.matchAll(MENTION_PATTERN)) {
    const [, leading, name] = match;
    const start = (match.index ?? 0) + (leading?.length ?? 0);
    if (start > cursor) parts.push(body.slice(cursor, start));
    parts.push(
      <span key={`m-${key++}`} className="rounded bg-primary/15 px-1 font-medium text-primary">
        @{name}
      </span>,
    );
    cursor = start + 1 + (name?.length ?? 0);
  }
  if (cursor < body.length) parts.push(body.slice(cursor));
  return <>{parts}</>;
}
