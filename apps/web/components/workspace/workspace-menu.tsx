'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Palette,
  Plus,
  Settings,
  Sun,
  UserRoundPlus,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiConfig } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useWorkspaces } from '@/lib/hooks/use-workspaces';
import {
  ACCENT_COLORS,
  usePreferencesStore,
  type AccentColor,
} from '@/lib/stores/preferences-store';
import { CreateWorkspaceModal } from './create-workspace-modal';

interface WorkspaceMenuProps {
  collapsed: boolean;
}

/**
 * The dropdown opened by clicking the workspace header row. Matches Figma p9:
 *   [avatar + workspace name] ▼
 *   ────────────────────────
 *   profile summary
 *   ────────────────────────
 *   ☀ Change Theme  ▶  { Light / Dark / System }
 *   ▪ Color Mode    ▶  { Amber / Blue / Pink / Rose / Emerald / Black }
 *   ⚙ Settings
 *   ────────────────────────
 *   ⏻ Sign out (destructive)
 */
export function WorkspaceMenu({ collapsed }: WorkspaceMenuProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const accent = usePreferencesStore((s) => s.accent);
  const setAccent = usePreferencesStore((s) => s.setAccent);
  const user = useAuthStore((s) => s.user);
  const workspace = useAuthStore((s) => s.workspace);
  const clearAuth = useAuthStore((s) => s.clear);
  const workspaces = useWorkspaces();
  const [createOpen, setCreateOpen] = useState(false);

  if (!workspace) return null;

  const handleSignOut = () => {
    clearAuth();
    // Hard nav so React state fully resets and no stale query cache lingers.
    window.location.href = '/login';
  };

  const handleSettings = () => {
    router.push('/settings');
  };

  const switchTo = (slug: string, id: string, name: string) => {
    if (slug === workspace.slug) return;
    // Update the store first so AuthGuard sees a matching slug on nav and
    // doesn't briefly render the "Switching workspace…" fallback.
    useAuthStore.setState({ workspace: { id, slug, name } });
    router.push(`/w/${slug}/tasks`);
  };

  const handleUpgradeToGoogle = () => {
    // Full page navigation — the OAuth flow requires the browser to follow
    // Google's 302 chain, not a fetch. Pass the current guest access token
    // as ?merge=<jwt>; the backend GoogleAuthGuard signs its user id into
    // OAuth state, and the callback upgrades the guest in place.
    const token = useAuthStore.getState().accessToken;
    if (!token) return;
    window.location.href = `${apiConfig.baseUrl}/auth/google?merge=${encodeURIComponent(token)}`;
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-sidebar-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            collapsed && 'justify-center px-0',
          )}
          aria-label="Open workspace menu"
        >
          <Avatar className="h-7 w-7 shrink-0">
            {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.fullName} /> : null}
            <AvatarFallback className="text-[10px]">{initials(workspace.name)}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <span className="truncate text-sm font-medium">{workspace.name}</span>
              <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
            </>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          {/* Profile summary */}
          {user ? (
            <>
              <div className="flex items-center gap-2 p-2">
                <Avatar className="h-9 w-9">
                  {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.fullName} /> : null}
                  <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{user.fullName}</p>
                    {user.isGuest ? (
                      <span className="shrink-0 rounded-sm bg-amber-100 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                        Guest
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
              {user.isGuest ? (
                <DropdownMenuItem onClick={handleUpgradeToGoogle}>
                  <UserRoundPlus className="mr-2 h-4 w-4" />
                  <span>Upgrade to Google account</span>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
            </>
          ) : null}

          {/* Workspace switcher — DropdownMenuLabel requires a Group ancestor
            per Base UI, so the whole workspaces section is wrapped. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>
            {workspaces.data && workspaces.data.length > 0
              ? workspaces.data.map((w) => (
                  <DropdownMenuItem
                    key={w.id}
                    onClick={() => switchTo(w.slug, w.id, w.name)}
                    className="pl-2"
                  >
                    <Avatar className="mr-2 h-5 w-5">
                      <AvatarFallback className="text-[9px]">{initials(w.name)}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate">{w.name}</span>
                    {w.slug === workspace.slug ? (
                      <Check className="ml-2 h-3.5 w-3.5" />
                    ) : (
                      <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                        {w.role.toLowerCase()}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))
              : null}
            <DropdownMenuItem onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              <span>Create workspace</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />

          {/* Change Theme submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Sun className="mr-2 h-4 w-4" />
              <span>Change Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <ThemeItem
                label="Light"
                value="light"
                active={theme === 'light'}
                onClick={setTheme}
              />
              <ThemeItem label="Dark" value="dark" active={theme === 'dark'} onClick={setTheme} />
              <ThemeItem
                label="System"
                value="system"
                active={theme === 'system'}
                onClick={setTheme}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Color Mode submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="mr-2 h-4 w-4" />
              <span>Color Mode</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {ACCENT_COLORS.map((c) => (
                <AccentItem key={c} accent={c} active={accent === c} onClick={() => setAccent(c)} />
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem onClick={handleSettings}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleSignOut}
            className="text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-950 dark:focus:text-red-300"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceModal open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function ThemeItem({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: (v: string) => void;
}) {
  return (
    <DropdownMenuItem onClick={() => onClick(value)}>
      <span className="flex-1">{label}</span>
      {active ? <Check className="h-4 w-4" /> : null}
    </DropdownMenuItem>
  );
}

const ACCENT_SWATCH: Record<AccentColor, string> = {
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  pink: 'bg-pink-500',
  rose: 'bg-rose-500',
  emerald: 'bg-emerald-500',
  black: 'bg-zinc-900 dark:bg-zinc-100',
};

function AccentItem({
  accent,
  active,
  onClick,
}: {
  accent: AccentColor;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onClick}>
      <span className={cn('mr-2 h-3.5 w-3.5 rounded-sm', ACCENT_SWATCH[accent])} />
      <span className="flex-1 capitalize">{accent}</span>
      {active ? <Check className="h-4 w-4" /> : null}
    </DropdownMenuItem>
  );
}

function initials(text: string): string {
  const parts = text.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
