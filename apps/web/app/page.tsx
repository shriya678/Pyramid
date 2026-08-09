import { apiConfig, fetchHealth, type HealthResponse } from '@/lib/api';

// Force dynamic rendering so we get a live probe on every visit.
export const dynamic = 'force-dynamic';

type Probe = { ok: true; data: HealthResponse; latencyMs: number } | { ok: false; error: string };

async function probeApi(): Promise<Probe> {
  const started = Date.now();
  try {
    const data = await fetchHealth();
    return { ok: true, data, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export default async function HomePage() {
  const probe = await probeApi();

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">Task Management System</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Day 2 hello-world. Confirms the frontend can reach the backend end to end.
          </p>
        </header>

        <section
          aria-label="API health"
          className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Backend API</h2>
            <StatusBadge ok={probe.ok && probe.data.status === 'ok'} />
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2 sm:gap-x-8">
            <Row label="Base URL" value={apiConfig.baseUrl} mono />
            {probe.ok ? (
              <>
                <Row label="API status" value={probe.data.status} mono />
                <Row label="Database" value={probe.data.db} mono />
                <Row
                  label="DB latency"
                  value={probe.data.dbLatencyMs !== null ? `${probe.data.dbLatencyMs} ms` : '—'}
                  mono
                />
                <Row label="Round trip" value={`${probe.latencyMs} ms`} mono />
                <Row label="API uptime" value={`${probe.data.uptimeSeconds}s`} mono />
                <Row label="API env" value={probe.data.env} mono />
                <Row label="Checked at" value={probe.data.timestamp} mono />
              </>
            ) : (
              <div className="sm:col-span-2 rounded-lg bg-red-50 px-4 py-3 text-red-900 dark:bg-red-950 dark:text-red-100">
                <p className="font-medium">Unable to reach the API.</p>
                <p className="mt-1 font-mono text-xs">{probe.error}</p>
                <p className="mt-2 text-xs">
                  Is the backend running? Try{' '}
                  <code className="rounded bg-red-100 px-1 py-0.5 dark:bg-red-900">pnpm dev</code>{' '}
                  at the repo root, then reload.
                </p>
              </div>
            )}
          </dl>
        </section>

        <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-500">
          This page is a temporary Day 2 scaffold. It gets replaced by the login screen and
          workspace shell in the following PRs.
        </p>
      </div>
    </main>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  const label = ok ? 'up' : 'down';
  const color = ok
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
    : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${color}`}>
      <span aria-hidden="true" className="mr-1">
        {ok ? '●' : '○'}
      </span>
      {label}
    </span>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className={`mt-1 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
