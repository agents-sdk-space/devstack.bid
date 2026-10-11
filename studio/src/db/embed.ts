/**
 * Deterministic local text embedding (feature hashing of word unigrams + char trigrams).
 * No network/API key needed, stable across sessions, good enough for semantic-ish
 * nearest-neighbour search over project notes, todos and imported Markdown vault chunks.
 */
export const EMBED_DIM = 128;

function fnv1a(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function embedText(text: string, dim = EMBED_DIM): number[] {
  const v = new Array<number>(dim).fill(0);
  const add = (feature: string, weight: number) => {
    const h = fnv1a(feature);
    const idx = h % dim;
    const sign = (fnv1a(feature, 0x9747b28c) & 1) === 0 ? 1 : -1;
    v[idx] = (v[idx] ?? 0) + sign * weight;
  };
  for (const tok of tokenize(text)) {
    add(`w:${tok}`, 1);
    const padded = `^${tok}$`;
    for (let i = 0; i + 3 <= padded.length; i++) add(`c:${padded.slice(i, i + 3)}`, 0.35);
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (!norm) {
    v[0] = 1;
    return v;
  }
  return v.map((x) => Number((x / norm).toFixed(6)));
}

export function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`;
}

export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? 1 - dot / d : 1;
}

/** Split Markdown into ~600 char chunks on heading/paragraph boundaries. */
export function chunkMarkdown(md: string, maxChars = 600): string[] {
  const blocks = md.split(/\n(?=#{1,6}\s)|\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = '';
  for (const b of blocks) {
    if (cur && cur.length + b.length + 2 > maxChars) {
      chunks.push(cur);
      cur = '';
    }
    if (b.length > maxChars) {
      for (let i = 0; i < b.length; i += maxChars) chunks.push(b.slice(i, i + maxChars));
      continue;
    }
    cur = cur ? `${cur}\n\n${b}` : b;
  }
  if (cur) chunks.push(cur);
  return chunks;
}
