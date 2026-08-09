import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Task Management System',
  description: 'Task management app inspired by Jira, Linear and Notion — technical assessment.',
};

// Using an inline `{ children }` type rather than the global `LayoutProps<'/'>`
// helper: LayoutProps is generated into .next/types/routes.d.ts by `next dev`
// or `next build`, so it doesn't exist on a fresh clone or in CI's typecheck step.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
