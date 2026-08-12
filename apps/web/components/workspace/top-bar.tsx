'use client';

import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAppShell } from './app-shell';

interface TopBarProps {
  /** Left-aligned page title (e.g. "Tasks", "Projects", "Design Homepage"). */
  title: ReactNode;
  /**
   * Right-aligned action slot. Pages fill this with their own search / filter /
   * primary CTA. Optional — pages that don't need actions leave it empty.
   */
  actions?: ReactNode;
}

/**
 * Top bar for every workspace page. Renders inside the AppShell layout;
 * pages instantiate this as their first child. Mobile hamburger opens the
 * sidebar Sheet via AppShell context (no prop plumbing needed by pages).
 */
export function TopBar({ title, actions }: TopBarProps) {
  const { openMobileSidebar } = useAppShell();
  return (
    <header
      className={cn(
        'flex h-14 min-w-0 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:px-6',
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 md:hidden"
        onClick={openMobileSidebar}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <h1 className="shrink-0 truncate text-lg font-semibold">{title}</h1>

      {actions ? (
        // Scrollable actions strip. On desktop everything fits and the strip
        // is invisible. On narrow viewports the actions overflow horizontally
        // inside the header instead of pushing the page sideways.
        <div className="ml-auto flex min-w-0 items-center gap-2 overflow-x-auto">{actions}</div>
      ) : null}
    </header>
  );
}
