'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { useEffect, type ReactNode } from 'react';
import { usePreferencesStore } from '@/lib/stores/preferences-store';

/**
 * Wraps next-themes for light/dark, plus reads our accent color from Zustand
 * and reflects it onto <html data-accent="..."> so the CSS variables in
 * globals.css take effect.
 *
 * Both persist via localStorage, so a page reload keeps both settings without
 * a flash — next-themes handles theme flash internally, and the accent CSS
 * uses `[data-accent]` which is applied after mount (accent is not visible on
 * the initial paint of unstyled HTML, so no flash to worry about there).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AccentReflector />
      {children}
    </NextThemesProvider>
  );
}

function AccentReflector() {
  const accent = usePreferencesStore((s) => s.accent);
  const hydrated = usePreferencesStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.setAttribute('data-accent', accent);
  }, [accent, hydrated]);

  return null;
}
