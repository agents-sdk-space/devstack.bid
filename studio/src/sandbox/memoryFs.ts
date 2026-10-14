import { normalizeProjectPath } from './paths';
import type { FileContent, SandboxFs } from './types';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** In-memory project filesystem: the single source of truth for project files. */
export class MemoryFs implements SandboxFs {
  private files = new Map<string, FileContent>();

  constructor(initial?: Record<string, FileContent>) {
    if (initial) {
      for (const [k, v] of Object.entries(initial)) this.files.set(normalizeProjectPath(k), v);
    }
  }

  async writeFile(path: string, content: FileContent): Promise<void> {
    this.files.set(normalizeProjectPath(path), content);
  }

  async readFile(path: string): Promise<string> {
    const v = this.files.get(normalizeProjectPath(path));
    if (v === undefined) throw new Error(`ENOENT: ${path}`);
    return typeof v === 'string' ? v : decoder.decode(v);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const v = this.files.get(normalizeProjectPath(path));
    if (v === undefined) throw new Error(`ENOENT: ${path}`);
    return typeof v === 'string' ? encoder.encode(v) : v;
  }

  async listFiles(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }

  has(path: string): boolean {
    return this.files.has(normalizeProjectPath(path));
  }

  snapshot(): Record<string, FileContent> {
    return Object.fromEntries(this.files);
  }

  textSnapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.files) if (typeof v === 'string') out[k] = v;
    return out;
  }
}
