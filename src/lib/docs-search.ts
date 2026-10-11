/**
 * Client-side docs search over public/docs-search-index.json (one entry per page section, built by
 * scripts/build-docs.mjs). Plain substring matching on NFC-normalised, lower-cased text, so Thai
 * (which has no spaces between words) works without a word segmenter: "ติดตั้ง" matches inside
 * "การติดตั้งเสร็จแล้ว". Space-separated terms must all match (AND).
 */
export interface SearchEntry {
  slug: string;
  title: string;
  id: string;
  heading: string;
  text: string;
}
export interface SearchHit extends SearchEntry {
  score: number;
  snippet: { before: string; match: string; after: string } | null;
}

export const normalize = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\u200b-\u200d\ufeff]/g, "");

export function searchDocs(entries: SearchEntry[], query: string, limit = 20): SearchHit[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const e of entries) {
    const title = normalize(e.title);
    const heading = normalize(e.heading);
    const text = normalize(e.text);
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const inTitle = title.includes(t);
      const inHeading = heading.includes(t);
      const inText = text.includes(t);
      if (!inTitle && !inHeading && !inText) { ok = false; break; }
      score += (inTitle ? 8 : 0) + (inHeading ? 4 : 0) + (inText ? 1 : 0);
    }
    if (!ok) continue;
    if (!e.id) score += 1; // prefer the page itself over its sections on ties
    hits.push({ ...e, score, snippet: snippet(e.text, terms) });
  }
  hits.sort((a, b) => b.score - a.score);
  // At most 3 hits per page, so one long page does not crowd out the rest.
  const perPage = new Map<string, number>();
  return hits.filter((h) => {
    const n = perPage.get(h.slug) ?? 0;
    perPage.set(h.slug, n + 1);
    return n < 3;
  }).slice(0, limit);
}

function snippet(text: string, terms: string[]) {
  const lower = normalize(text);
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i < 0) continue;
    // normalize() keeps string length for NFC input (docs are NFC), so indexes map back to `text`.
    const start = Math.max(0, i - 50);
    const end = Math.min(text.length, i + t.length + 90);
    return {
      before: (start > 0 ? "…" : "") + text.slice(start, i),
      match: text.slice(i, i + t.length),
      after: text.slice(i + t.length, end) + (end < text.length ? "…" : ""),
    };
  }
  return text ? { before: "", match: "", after: text.slice(0, 140) + (text.length > 140 ? "…" : "") } : null;
}
