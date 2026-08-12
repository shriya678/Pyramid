'use client';

/** Cheap skeleton that mimics the four-column board layout while data loads. */
export function BoardSkeleton() {
  return (
    <div className="flex h-full min-h-0 gap-3 overflow-hidden p-4">
      {Array.from({ length: 4 }).map((_, colIdx) => (
        <div
          key={colIdx}
          className="flex h-full w-72 shrink-0 flex-col rounded-lg border bg-muted/30"
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-muted" />
            <span className="h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex-1 space-y-2 px-2">
            {Array.from({ length: 2 }).map((__, cardIdx) => (
              <div key={cardIdx} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
