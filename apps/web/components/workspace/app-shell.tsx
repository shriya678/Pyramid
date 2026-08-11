'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { usePreferenceSync } from '@/lib/hooks/use-preference-sync';
import { Sidebar } from './sidebar';

interface AppShellCtx {
  /** Called by TopBar's hamburger on mobile to open the drawer. */
  openMobileSidebar: () => void;
}

const AppShellContext = createContext<AppShellCtx | null>(null);

/** Consumed by TopBar so pages don't have to plumb the callback through. */
export function useAppShell(): AppShellCtx {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error('useAppShell must be called inside <AppShell />');
  }
  return ctx;
}

/**
 * Two-panel layout for every workspace page:
 *   Desktop (md+):  [sidebar (inline) | main content ]
 *   Mobile (<md):   [ main content ]  + Sheet-based sidebar drawer
 *
 * The sidebar collapse state (icon-rail vs full) is ephemeral per tab —
 * doesn't sync across devices, doesn't persist. Users don't expect it to.
 *
 * Also mounts `usePreferenceSync` once, so any signed-in workspace page
 * two-way-syncs theme + accent with the server-side UserPreference row.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  usePreferenceSync();

  return (
    <AppShellContext.Provider value={{ openMobileSidebar: () => setMobileOpen(true) }}>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        {/* Desktop sidebar */}
        <div className="hidden shrink-0 md:block">
          <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />
        </div>

        {/* Mobile drawer */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-60 border-r-0 p-0 sm:max-w-none">
            <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
            <Sidebar collapsed={false} onToggleCollapsed={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Main content — pages render TopBar as their first child */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </AppShellContext.Provider>
  );
}
