/** Ring buffer of raw terminal output so the xterm view can replay it on mount. */
export class TerminalBuffer {
  private chunks: string[] = [];
  private size = 0;
  private listeners = new Set<(chunk: string) => void>();

  constructor(private maxChars = 300_000) {}

  write(chunk: string): void {
    const normalized = chunk.replace(/(?<!\r)\n/g, '\r\n');
    this.chunks.push(normalized);
    this.size += normalized.length;
    while (this.size > this.maxChars && this.chunks.length > 1) {
      this.size -= (this.chunks.shift() as string).length;
    }
    for (const l of this.listeners) l(normalized);
  }

  replay(): string {
    return this.chunks.join('');
  }

  /** Plain text (ANSI stripped) for tests / diagnostics. */
  plainText(): string {
    // eslint-disable-next-line no-control-regex
    return this.replay().replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  }

  subscribe(fn: (chunk: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
