import type { buildPreviewBundle as BuildFn, PreviewBundle } from './staticBundler';
import type { FileContent, SandboxStatus } from './types';

export interface StaticPreviewEvents {
  onOutput: (chunk: string) => void;
  onStatus: (s: SandboxStatus) => void;
  /** A new bundle is ready: (re)load the preview iframe. */
  onBundle: (url: string) => void;
}

/** URL of the static preview host page (served from public/preview/ with its own strict CSP). */
export const PREVIEW_HOST_PATH = `${import.meta.env.BASE_URL}preview/`;
const VENDOR_PATH = `${import.meta.env.BASE_URL}preview/vendor.js`;

const tag = (s: string) => `\x1b[36m[studio]\x1b[0m ${s}\r\n`;

/**
 * Open-source replacement for the WebContainers sandbox: bundles the project in the browser
 * (Sucrase) and runs it in a sandboxed iframe. No Node, no npm install, no network.
 */
export class StaticPreviewSandbox {
  private vendor: string | null = null;
  /** Sucrase-based bundler, loaded lazily so it stays out of the first-paint chunk. */
  private build: typeof BuildFn | null = null;
  private bundle: PreviewBundle | null = null;
  private status: SandboxStatus = { phase: 'idle' };
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private events: StaticPreviewEvents,
    private fetchText: (url: string) => Promise<string> = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      return res.text();
    },
  ) {}

  getStatus(): SandboxStatus {
    return this.status;
  }

  getBundle(): PreviewBundle | null {
    return this.bundle;
  }

  private setStatus(s: SandboxStatus): void {
    this.status = s;
    this.events.onStatus(s);
  }

  async boot(files: Record<string, FileContent>): Promise<void> {
    try {
      this.setStatus({ phase: 'booting', message: 'Loading preview runtime…' });
      this.events.onOutput(tag('Static preview: Sucrase bundler + sandboxed iframe (react, react-dom only)'));
      const [vendor, mod] = await Promise.all([this.fetchText(VENDOR_PATH), import('./staticBundler')]);
      this.vendor = vendor;
      this.build = mod.buildPreviewBundle;
      this.rebuild(files);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus({ phase: 'error', message });
      this.events.onOutput(`\x1b[31m[studio] Preview error: ${message}\x1b[0m\r\n`);
    }
  }

  /** Debounced rebuild after file edits. */
  schedule(getFiles: () => Record<string, FileContent>, delayMs = 250): void {
    if (!this.vendor || !this.build) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.rebuild(getFiles());
    }, delayMs);
  }

  rebuild(files: Record<string, FileContent>): boolean {
    if (!this.build) return false;
    const started = performance.now();
    const res = this.build(files);
    if (!res.bundle) {
      this.setStatus({ phase: 'error', message: res.errors[0] ?? 'bundle failed' });
      for (const e of res.errors) this.events.onOutput(`\x1b[31m[studio] ${e.replace(/\n/g, '\r\n')}\x1b[0m\r\n`);
      return false;
    }
    this.bundle = res.bundle;
    const ms = Math.round(performance.now() - started);
    this.events.onOutput(tag(`bundled ${res.moduleCount} modules in ${ms} ms → ${res.bundle.entry}`));
    this.setStatus({ phase: 'ready', message: 'Static preview' });
    this.events.onBundle(PREVIEW_HOST_PATH);
    return true;
  }

  /** Message the iframe receives after it says hello. */
  loadMessage(): Record<string, unknown> | null {
    if (!this.bundle || !this.vendor) return null;
    return { type: 'nvx-preview:load', vendor: this.vendor, ...this.bundle };
  }
}
