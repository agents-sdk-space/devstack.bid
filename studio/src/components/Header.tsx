import { Mascot } from '@/brand/mascot';
import { useDevstack, useRuntime } from '@/context/hooks';
import { useLang } from '@/i18n';

function Chip({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'idle' | 'err' }) {
  const dot =
    tone === 'ok'
      ? 'bg-devstack-success'
      : tone === 'warn'
        ? 'bg-devstack-warning'
        : tone === 'err'
          ? 'bg-devstack-danger'
          : 'bg-devstack-muted';
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-devstack-border bg-devstack-surface px-2 py-1 font-mono text-[10px] text-devstack-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="uppercase tracking-wider">{label}</span>
      <span className="max-w-[180px] truncate text-white/80">{value}</span>
    </span>
  );
}

// Plain <a> links on purpose: /studio is a separate document (cross-origin isolated), so moving
// to or from it must be a full page load.
const NAV = [
  { href: '/', key: 'nav.home' },
  { href: '/learn', key: 'nav.learn' },
  { href: '/chat', key: 'nav.chat' },
  { href: '/docs/user-guide/studio', key: 'nav.guide' },
] as const;

export function Header() {
  const rt = useRuntime();
  const { t, lang, setLang } = useLang();
  const backend = useDevstack((s) => s.backend);
  const llmLabel = useDevstack((s) => s.llmLabel);
  const sandbox = useDevstack((s) => s.sandbox);
  const dbReady = useDevstack((s) => s.dbReady);
  const assetPanelOpen = useDevstack((s) => s.assetPanelOpen);
  const quota = backend?.quota;

  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-devstack-border bg-black/80 px-4 py-2.5 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <a href="/" className="flex items-center gap-2 rounded-md font-semibold tracking-tight" aria-label="NVX Stack Builder home">
          <Mascot size={28} interactive />
          <span className="hidden text-[15px] text-white sm:inline">Stack Builder</span>
        </a>
        <span className="text-devstack-muted" aria-hidden>
          /
        </span>
        <h1 className="font-display text-[15px] font-semibold tracking-display text-white">
          Studio
          <span className="ml-2 rounded-full border border-devstack-border px-1.5 py-0.5 align-middle font-mono text-[9px] font-medium uppercase tracking-wider text-devstack-muted">
            beta
          </span>
        </h1>
        <nav aria-label="devstack.bid" className="ml-2 hidden items-center gap-1 xl:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-md px-2.5 py-1 text-[13px] text-devstack-muted hover:text-white">
              {t(n.key)}
            </a>
          ))}
        </nav>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2" data-testid="status-chips">
        <Chip label="LLM" value={llmLabel} tone={backend?.llm ? 'ok' : 'warn'} />
        <Chip label="Image" value={backend?.imageModel ?? 'placeholder'} tone={backend?.image ? 'ok' : 'warn'} />
        <Chip
          label="Sandbox"
          value={sandbox.phase}
          tone={sandbox.phase === 'ready' ? 'ok' : sandbox.phase === 'error' ? 'err' : 'idle'}
        />
        <Chip label="DB" value={dbReady ? 'PGlite + pgvector' : 'starting'} tone={dbReady ? 'ok' : 'idle'} />
        {quota ? (
          <span data-testid="quota-chip">
            <Chip label={t('chip.quota')} value={`${quota.callsLeft} LLM · ${quota.imagesLeft} img`} tone={quota.callsLeft > 0 ? 'ok' : 'warn'} />
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setLang(lang === 'en' ? 'th' : 'en')}
          aria-label={t('lang.label')}
          data-testid="lang-toggle"
          className="rounded-md border border-devstack-border px-3 py-2 text-xs text-devstack-muted hover:border-devstack-accent hover:text-white"
        >
          {t('lang.toggle')}
        </button>
        <button
          type="button"
          onClick={() => rt.store.setState({ assetPanelOpen: !assetPanelOpen })}
          className="rounded-md border border-devstack-border px-3 py-2 text-xs text-devstack-muted hover:border-devstack-accent hover:text-white"
        >
          {t('header.assets')}
        </button>
        <button
          type="button"
          data-testid="deploy-export"
          onClick={() => rt.store.setState({ exportOpen: true })}
          className="rounded-full bg-devstack-cta px-4 py-2 text-sm font-semibold tracking-display text-white transition hover:bg-devstack-cta-hover"
        >
          {t('header.export')}
        </button>
      </div>
    </header>
  );
}
