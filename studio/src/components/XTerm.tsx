import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';

const THEME = {
  background: '#0c0c0d',
  foreground: '#cbd5e1',
  cursor: '#2997FF',
  selectionBackground: '#1E293B',
  cyan: '#2997FF',
  brightCyan: '#2997FF',
};

export interface XTermProps {
  /** Called once with the terminal; return a cleanup. */
  attach: (term: Terminal) => (() => void) | void;
  testId?: string;
}

export function XTerm({ attach, testId }: XTermProps) {
  const ref = useRef<HTMLDivElement>(null);
  const attachRef = useRef(attach);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const term = new Terminal({
      theme: THEME,
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      fontSize: 12,
      convertEol: false,
      scrollback: 5000,
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    const safeFit = () => {
      try {
        fit.fit();
      } catch {
        /* element hidden */
      }
    };
    safeFit();
    const ro = new ResizeObserver(safeFit);
    ro.observe(el);
    const cleanup = attachRef.current(term);
    return () => {
      ro.disconnect();
      cleanup?.();
      term.dispose();
    };
  }, []);

  return <div ref={ref} data-testid={testId} className="h-full w-full overflow-hidden px-2 py-1" />;
}
