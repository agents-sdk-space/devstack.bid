import { MemoryFs } from './memoryFs';
import type { FileContent, SandboxFs } from './types';

export type FileChangeListener = (path: string, content: FileContent) => void;

/**
 * Project filesystem used by agents and the editor. Keeps the canonical copy in memory
 * (so export works without the runtime) and can write through to an optional mirror FS.
 */
export class ProjectFs implements SandboxFs {
  readonly memory: MemoryFs;
  private mirror: SandboxFs | null = null;
  private listeners = new Set<FileChangeListener>();

  constructor(initial?: Record<string, FileContent>) {
    this.memory = new MemoryFs(initial);
  }

  onChange(fn: FileChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Attach the live runtime FS and push the current snapshot into it. */
  async attachMirror(mirror: SandboxFs): Promise<void> {
    this.mirror = mirror;
    for (const [path, content] of Object.entries(this.memory.snapshot())) {
      await mirror.writeFile(path, content);
    }
  }

  async writeFile(path: string, content: FileContent): Promise<void> {
    await this.memory.writeFile(path, content);
    if (this.mirror) await this.mirror.writeFile(path, content);
    for (const l of this.listeners) l(path, content);
  }

  /** Update the canonical copy without echoing to the mirror (e.g. lockfile read back from it). */
  async writeFromMirror(path: string, content: FileContent): Promise<void> {
    await this.memory.writeFile(path, content);
    for (const l of this.listeners) l(path, content);
  }

  readFile(path: string): Promise<string> {
    return this.memory.readFile(path);
  }

  readBinary(path: string): Promise<Uint8Array> {
    return this.memory.readBinary(path);
  }

  listFiles(): Promise<string[]> {
    return this.memory.listFiles();
  }
}
