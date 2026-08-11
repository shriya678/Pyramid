'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, LayoutGrid, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth-store';
import { WorkspaceMenu } from './workspace-menu';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/**
 * Left sidebar for the workspace app. Two modes:
 *   - Expanded (~240px): workspace header with dropdown, nav labels
 *   - Collapsed (~64px): icon-only rail
 *
 * Renders inline on desktop; the mobile Sheet wraps this component in a
 * drawer overlay (see AppShell). The `collapsed` state is per-tab session
 * state — not persisted, not synced.
 */
export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();

  const slug = workspace?.slug ?? '';
  const nav = [
    { label: 'Tasks', href: `/w/${slug}/tasks`, icon: LayoutGrid },
    { label: 'Projects', href: `/w/${slug}/projects`, icon: Briefcase },
  ];

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
      aria-label="Workspace navigation"
    >
      {/* Header — clickable to open user menu */}
      <div className="flex items-center justify-between gap-1 border-b border-border p-2">
        <WorkspaceMenu collapsed={collapsed} />
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapsed}
          className="h-8 w-8 shrink-0"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-2">
        {!collapsed && (
          <div className="mb-1 px-2 py-1 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/60">
            Workspace
          </div>
        )}
        {nav.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                collapsed && 'justify-center',
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer — user avatar (opens same menu; a nod to Figma p2's bottom-left) */}
      {user ? (
        <div
          className={cn(
            'flex items-center gap-2 border-t border-border p-2',
            collapsed && 'justify-center',
          )}
        >
          <Avatar className="h-8 w-8 shrink-0">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.fullName} /> : null}
            <AvatarFallback className="text-xs">{initials(user.fullName)}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.fullName}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{user.email}</p>
            </div>
          )}
        </div>
      ) : null}
    </aside>
  );
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
