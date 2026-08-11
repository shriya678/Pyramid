import { use, type ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { AppShell } from '@/components/workspace/app-shell';

/**
 * Layout applied to every page under /w/[slug]/. AuthGuard bounces anonymous
 * users to /login and confirms the URL slug matches the caller's workspace;
 * AppShell provides the sidebar + main region + mobile drawer.
 */
export default function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <AuthGuard requiredSlug={slug}>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
