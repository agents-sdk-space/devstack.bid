import type { FileSystemTree, WebContainer, WebContainerProcess } from '@webcontainer/api';
import { normalizeProjectPath } from './paths';
import type { FileContent, SandboxFs, SandboxStatus } from './types';

class WebContainerFs implements SandboxFs {
  constructor(private wc: WebContainer) {}

  async writeFile(path: string, content: FileContent): Promise<void> {
    const p = normalizeProjectPath(path);
    const dir = p.split('/').slice(0, -1).join('/');
    if (dir) await this.wc.fs.mkdir(dir, { recursive: true });
    await this.wc.fs.writeFile(p, content);
  }

  async readFile(path: string): Promise<string> {
    return this.wc.fs.readFile(normalizeProjectPath(path), 'utf-8');
  }

  async readBinary(path: string): Promise<Uint8Array> {
    return this.wc.fs.readFile(normalizeProjectPath(path));
  }

  async listFiles(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string) => {
      const entries = await this.wc.fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = dir === '.' ? entry.name : `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          await walk(full);
        } else out.push(full);
      }
    };
    await walk('.');
    return out.sort();
  }
}

export function toFileSystemTree(files: Record<string, FileContent>): FileSystemTree {
  const tree: FileSystemTree = {};
  for (const [rawPath, contents] of Object.entries(files)) {
    const segs = normalizeProjectPath(rawPath).split('/');
    let node: FileSystemTree = tree;
    segs.forEach((seg, i) => {
      if (i === segs.length - 1) {
        node[seg] = { file: { contents } };
      } else {
        const existing = node[seg];
        if (!existing || !('directory' in existing)) node[seg] = { directory: {} };
        node = (node[seg] as { directory: FileSystemTree }).directory;
      }
    });
  }
  return tree;
}

export interface SandboxEvents {
  onOutput: (chunk: string) => void;
  onStatus: (s: SandboxStatus) => void;
  onPreviewUrl: (url: string) => void;
}

/** Boots a WebContainer, mounts the project, installs deps and runs the Vite dev server (HMR). */
export class WebContainerSandbox {
  private wc: WebContainer | null = null;
  private fsImpl: WebContainerFs | null = null;
  private devProcess: WebContainerProcess | null = null;
  private status: SandboxStatus = { phase: 'idle' };

  constructor(private events: SandboxEvents) {}

  getStatus(): SandboxStatus {
    return this.status;
  }

  private setStatus(s: SandboxStatus): void {
    this.status = s;
    this.events.onStatus(s);
  }

  private pipe(proc: WebContainerProcess): void {
    void proc.output
      .pipeTo(new WritableStream({ write: (chunk) => this.events.onOutput(chunk) }))
      .catch(() => undefined);
  }

  getFs(): SandboxFs {
    if (!this.fsImpl) throw new Error('Sandbox not booted');
    return this.fsImpl;
  }

  /**
   * @param files snapshot to mount
   * @param onMounted called right after mount so callers can attach write-through.
   * @returns package-lock.json produced by npm install (if any)
   */
  async boot(
    files: Record<string, FileContent>,
    onMounted: (fs: SandboxFs) => Promise<void>,
  ): Promise<string | null> {
    if (this.wc) return null;
    try {
      if (typeof window !== 'undefined' && !window.crossOriginIsolated) {
        throw new Error('Page is not cross-origin isolated (COOP/COEP headers missing)');
      }
      this.setStatus({ phase: 'booting', message: 'Booting WebContainer…' });
      this.events.onOutput('\x1b[36m[devstack]\x1b[0m Booting WebContainer…\r\n');
      const { WebContainer } = await import('@webcontainer/api');
      this.wc = await WebContainer.boot({ coep: 'require-corp', workdirName: 'devstack-app' });
      this.fsImpl = new WebContainerFs(this.wc);
      this.wc.on('server-ready', (_port, url) => this.events.onPreviewUrl(url));
      this.wc.on('error', (e) => this.events.onOutput(`\r\n[webcontainer] ${e.message}\r\n`));

      await this.wc.mount(toFileSystemTree(files));
      await onMounted(this.fsImpl);

      this.setStatus({ phase: 'installing', message: 'npm install' });
      this.events.onOutput('\x1b[36m[devstack]\x1b[0m $ npm install\r\n');
      const install = await this.wc.spawn('npm', ['install', '--no-audit', '--no-fund']);
      this.pipe(install);
      const code = await install.exit;
      if (code !== 0) throw new Error(`npm install exited with ${code}`);

      let lock: string | null = null;
      try {
        lock = await this.wc.fs.readFile('package-lock.json', 'utf-8');
      } catch {
        lock = null;
      }

      this.setStatus({ phase: 'starting', message: 'npm run dev' });
      this.events.onOutput('\x1b[36m[devstack]\x1b[0m $ npm run dev\r\n');
      this.devProcess = await this.wc.spawn('npm', ['run', 'dev']);
      this.pipe(this.devProcess);
      void this.devProcess.exit.then((c) => {
        if (this.status.phase !== 'error') this.setStatus({ phase: 'error', message: `dev server exited (${c})` });
      });
      this.setStatus({ phase: 'ready', message: 'Dev server running (HMR)' });
      return lock;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus({ phase: 'error', message });
      this.events.onOutput(`\r\n\x1b[31m[devstack] Sandbox error: ${message}\x1b[0m\r\n`);
      throw err;
    }
  }

  /** Spawn an interactive shell (jsh) bound to a terminal. */
  async startShell(
    cols: number,
    rows: number,
    onData: (d: string) => void,
  ): Promise<{ write: (d: string) => void; resize: (c: number, r: number) => void }> {
    if (!this.wc) throw new Error('Sandbox not booted');
    const shell = await this.wc.spawn('jsh', { terminal: { cols, rows } });
    void shell.output.pipeTo(new WritableStream({ write: onData })).catch(() => undefined);
    const writer = shell.input.getWriter();
    return {
      write: (d) => void writer.write(d),
      resize: (c, r) => shell.resize({ cols: c, rows: r }),
    };
  }
}
