import { use, type ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { AppShell } from '@/components/workspace/app-shell';

/**
 * Layout applied to every page under /w/[slug]/. AuthGuard bounces anonymous
 * users to /login and confirms the URL slug matches the caller's workspace;
 * AppShell provides the sidebar + main region + mobile drawer.
 *
 * The `modal` slot is a Next.js parallel route (see the @modal folder). Card
 * clicks navigate to /t/[id] within the same segment, and the
 * @modal/(.)t/[id] intercept renders the task detail as an overlay on top
 * of `children` while the URL updates for shareability. Direct visits to
 * that URL (bookmark, refresh) hit /t/[id]/page.tsx, which renders the
 * Board underneath + the same modal on top.
 *
 * Task detail lives at /t/[id] rather than /tasks/[id] to avoid a Next 16
 * parallel-route collision: when an intercept and a static child both
 * match the same segment (e.g. /tasks/list vs /tasks/[id]), the children
 * slot silently renders default (null). Using a distinct segment
 * eliminates the ambiguity.
 */
export default function WorkspaceLayout({
  children,
  modal,
  params,
}: {
  children: ReactNode;
  // Optional so the type is compatible with Next's generated LayoutProps
  // when the @modal slot's types haven't been regenerated yet (e.g. right
  // after adding the folder — happens once, gone after next dev picks up).
  modal?: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <AuthGuard requiredSlug={slug}>
      <AppShell>
        {children}
        {modal ?? null}
      </AppShell>
    </AuthGuard>
  );
}
