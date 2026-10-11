import type { Terminal } from '@xterm/xterm';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDevstack, useRuntime } from '@/context/hooks';
import { useLang } from '@/i18n';
import { XTerm } from './XTerm';

function OutputTerminal() {
  const rt = useRuntime();
  const attach = useCallback(
    (term: Terminal) => {
      term.write(rt.terminal.replay());
      return rt.terminal.subscribe((c) => term.write(c));
    },
    [rt],
  );
  return <XTerm attach={attach} testId="terminal-output" />;
}

function ShellTerminal() {
  const rt = useRuntime();
  const attach = useCallback(
    (term: Terminal) => {
      let disposed = false;
      let input: { dispose: () => void } | undefined;
      let resize: { dispose: () => void } | undefined;
      rt.startShell(term.cols, term.rows, (d) => {
        if (!disposed) term.write(d);
      })
        .then((sh) => {
          input = term.onData((d) => sh.write(d));
          resize = term.onResize(({ cols, rows }) => sh.resize(cols, rows));
        })
        .catch((err: unknown) => term.write(`\r\nShell unavailable: ${String(err)}\r\n`));
      return () => {
        disposed = true;
        input?.dispose();
        resize?.dispose();
      };
    },
    [rt],
  );
  return <XTerm attach={attach} testId="terminal-shell" />;
}

export function PreviewTerminal() {
  const { t } = useLang();
  const rt = useRuntime();
  const previewUrl = useDevstack((s) => s.previewUrl);
  const nonce = useDevstack((s) => s.previewNonce);
  const sandbox = useDevstack((s) => s.sandbox);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [tab, setTab] = useState<'output' | 'shell'>('output');
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    rt.setPreviewWindowGetter(() => iframeRef.current?.contentWindow ?? null);
  }, [rt]);

  return (
    <div className="grid h-[42%] min-h-[220px] grid-cols-2 gap-2">
      <section className="panel flex min-h-0 flex-col overflow-hidden" data-testid="preview-panel">
        <header className="panel-header flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-xs text-devstack-muted">
            Live preview ·{' '}
            <span data-testid="sandbox-phase" className={sandbox.phase === 'ready' ? 'text-devstack-accent' : ''}>
              {sandbox.phase}
            </span>
          </span>
          <div className="flex min-w-0 items-center gap-2">
            {previewUrl && (
              <>
                <span className="truncate font-mono text-[10px] text-devstack-muted" title={previewUrl}>
                  localhost:5173
                </span>
                <button
                  type="button"
                  onClick={() => setReloads((n) => n + 1)}
                  className="rounded border border-devstack-border px-2 py-0.5 text-[10px] text-devstack-muted hover:text-white"
                >
                  Reload
                </button>
              </>
            )}
          </div>
        </header>
        <div className="min-h-0 flex-1 bg-black">
          {previewUrl ? (
            <iframe
              ref={iframeRef}
              key={`${nonce}-${reloads}`}
              data-testid="preview-iframe"
              title={t('preview.title')}
              src={previewUrl}
              allow="cross-origin-isolated; clipboard-write"
              className="h-full w-full border-0 bg-black"
            />
          ) : (
            <p className="p-4 font-mono text-xs text-devstack-muted">
              {sandbox.phase === 'error'
                ? `Sandbox unavailable: ${sandbox.message ?? 'unknown error'}`
                : `Preview appears when the sandbox dev server is ready (${sandbox.message ?? sandbox.phase})…`}
            </p>
          )}
        </div>
      </section>
      <section className="panel flex min-h-0 flex-col overflow-hidden" data-testid="terminal-panel">
        <header className="panel-header flex items-center gap-1 px-2 py-1.5">
          {(['output', 'shell'] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={t === 'shell' && sandbox.phase !== 'ready'}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-0.5 font-mono text-[11px] disabled:opacity-40 ${
                tab === t ? 'bg-devstack-secondary text-devstack-accent' : 'text-devstack-muted hover:text-white'
              }`}
            >
              {t === 'output' ? 'Output' : 'Shell (jsh)'}
            </button>
          ))}
        </header>
        <div className="min-h-0 flex-1">{tab === 'output' ? <OutputTerminal /> : <ShellTerminal />}</div>
      </section>
    </div>
  );
}
