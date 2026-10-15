/** Grapheme-safe text reveal for streaming chat (Thai and combined marks stay intact). */

let sharedSegmenter: Intl.Segmenter | undefined;

export function graphemeSegmenter(locale = "th"): Intl.Segmenter {
  if (!sharedSegmenter) {
    sharedSegmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  }
  return sharedSegmenter;
}

export function splitGraphemes(text: string, segmenter = graphemeSegmenter()): string[] {
  if (!text) return [];
  return [...segmenter.segment(text)].map((s) => s.segment);
}

/** Buffers incoming full text and reveals grapheme-by-grapheme. */
export class RevealBuffer {
  private target = "";
  private segments: string[] = [];
  private index = 0;

  setTarget(text: string, segmenter = graphemeSegmenter()): void {
    if (text === this.target) return;
    this.target = text;
    this.segments = splitGraphemes(text, segmenter);
    if (this.index > this.segments.length) this.index = this.segments.length;
  }

  visible(): string {
    if (this.index >= this.segments.length) return this.target;
    return this.segments.slice(0, this.index).join("");
  }

  backlog(): number {
    return Math.max(0, this.segments.length - this.index);
  }

  caughtUp(): boolean {
    return this.index >= this.segments.length;
  }

  flush(): void {
    this.index = this.segments.length;
  }

  /** Reveal up to `count` graphemes. Returns whether the visible string changed. */
  advance(count: number): boolean {
    if (count <= 0 || this.caughtUp()) return false;
    const next = Math.min(this.index + count, this.segments.length);
    if (next === this.index) return false;
    this.index = next;
    return true;
  }
}

/** Pick a reveal step size from backlog (smooth when slow, catches up when far behind). */
export function revealStepSize(backlog: number): number {
  if (backlog > 120) return 12;
  if (backlog > 40) return 6;
  if (backlog > 8) return 3;
  return 1;
}

/** Truncate at last closed fenced code block so partial fences do not flicker during stream. */
export function markdownStablePrefix(text: string): string {
  const ticks = text.match(/```/g);
  if (!ticks || ticks.length % 2 === 0) return text;
  const last = text.lastIndexOf("```");
  if (last <= 0) return text;
  return text.slice(0, last);
}
