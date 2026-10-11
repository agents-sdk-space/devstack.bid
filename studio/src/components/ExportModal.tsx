import { useState } from 'react';
import { useDevstack, useRuntime } from '@/context/hooks';
import { useLang } from '@/i18n';

const SECTIONS = [
  { title: '1 · Source bundle', items: ['package.json + package-lock.json', 'src/**, public/assets/**', '.env.example, README.md'] },
  { title: '2 · Deploy payload', items: ['vercel.json (Vercel)', 'wrangler.toml + _redirects (Cloudflare Pages)', 'Dockerfile + nginx.conf'] },
  { title: '3 · DB migration blueprint', items: ['db/migrations/001_init.sql (schema + pgvector + data)', 'db/schema.prisma'] },
];

export default function ExportModal() {
  const { t } = useLang();
  const rt = useRuntime();
  const open = useDevstack((s) => s.exportOpen);
  const exporting = useDevstack((s) => s.exporting);
  const last = useDevstack((s) => s.lastExport);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={() => rt.store.setState({ exportOpen: false })}
    >
      <div
        role="dialog"
        aria-label={t('export.title')}
        data-testid="export-modal"
        className="panel w-[640px] max-w-[92vw] p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-header flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-display">{t('export.title')}</h2>
            <p className="text-xs text-devstack-muted">{t('export.subtitle')}</p>
          </div>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => rt.store.setState({ exportOpen: false })}
            className="text-devstack-muted hover:text-white"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="grid grid-cols-3 gap-3 p-5">
          {SECTIONS.map((s) => (
            <div key={s.title} className="rounded border border-devstack-border bg-black/40 p-3">
              <p className="mb-2 font-display text-xs font-semibold text-devstack-accent">{s.title}</p>
              <ul className="space-y-1 text-[11px] text-devstack-muted">
                {s.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {last && (
          <div className="mx-5 mb-4 max-h-44 overflow-y-auto rounded border border-devstack-border bg-black/40 p-3" data-testid="export-manifest">
            <p className="mb-1 font-mono text-[11px] text-devstack-accent">
              {last.filename} · {(last.bytes / 1024).toFixed(1)} KB · {last.files.length} files
            </p>
            <ul className="columns-2 font-mono text-[10px] text-devstack-muted">
              {last.files.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="mx-5 mb-3 text-xs text-red-400">{error}</p>}
        <footer className="flex justify-end gap-2 border-t border-devstack-border px-5 py-4">
          <button
            type="button"
            onClick={() => rt.store.setState({ exportOpen: false })}
            className="rounded border border-devstack-border px-4 py-2 text-sm text-devstack-muted hover:text-white"
          >
            Close
          </button>
          <button
            type="button"
            data-testid="download-zip"
            disabled={exporting}
            onClick={() => {
              setError(null);
              rt.exportProject().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
            }}
            className="rounded-md bg-devstack-cta px-4 py-2 text-sm font-semibold text-white hover:bg-devstack-cta-hover disabled:opacity-60"
          >
            {exporting ? 'Bundling…' : 'Download .zip'}
          </button>
        </footer>
      </div>
    </div>
  );
}
