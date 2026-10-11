import { useState } from 'react';
import { useDevstack, useRuntime } from '@/context/hooks';
import { useLang } from '@/i18n';

export function AssetPanel() {
  const { t } = useLang();
  const rt = useRuntime();
  const assets = useDevstack((s) => s.assets);
  const open = useDevstack((s) => s.assetPanelOpen);
  const backend = useDevstack((s) => s.backend);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const onGenerate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await rt.generateAsset(prompt.trim());
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      data-testid="asset-panel"
      className="panel absolute right-2 top-2 bottom-2 z-20 flex w-60 flex-col overflow-hidden shadow-2xl shadow-black/80 xl:static xl:right-auto xl:top-auto xl:bottom-auto xl:z-auto"
    >
      <header className="panel-header flex items-start justify-between px-3 py-3">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-display">{t('assets.title')}</h2>
          <p className="text-[11px] text-devstack-muted">
            {backend?.image ? backend.imageModel : 'placeholder generator'} → /public/assets
          </p>
        </div>
        <button
          type="button"
          aria-label={t('assets.close')}
          onClick={() => rt.store.setState({ assetPanelOpen: false })}
          className="text-xs text-devstack-muted hover:text-white"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>
      <div className="space-y-2 border-b border-devstack-border p-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder={t('assets.prompt')}
          className="w-full resize-none rounded border border-devstack-border bg-black p-2 text-xs text-white outline-none focus:border-devstack-accent"
        />
        <button
          type="button"
          disabled={busy || !prompt.trim()}
          onClick={() => void onGenerate()}
          className="btn-ai w-full py-1.5 text-xs font-medium"
        >
          {busy ? 'Generating…' : 'Generate image'}
        </button>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2" data-testid="asset-list">
        {assets.length === 0 ? (
          <p className="text-xs text-devstack-muted">{t('assets.empty')}</p>
        ) : (
          assets.map((a) => (
            <figure key={a.path} className="overflow-hidden rounded border border-devstack-border" data-path={a.path}>
              <img src={a.dataUrl} alt={a.path} className="block w-full" />
              <figcaption className="flex items-center justify-between gap-1 px-2 py-1 font-mono text-[10px] text-devstack-muted">
                <span className="truncate">{a.path}</span>
                <span className={a.source === 'proxy' ? 'text-devstack-accent' : ''}>{a.source === 'proxy' ? 'AI' : 'mock'}</span>
              </figcaption>
            </figure>
          ))
        )}
      </div>
    </aside>
  );
}
