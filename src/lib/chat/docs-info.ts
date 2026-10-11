import { normalize, type SearchEntry } from "@/lib/docs-search";

/**
 * Server-side implementation of the agent's `get_agents_sdk_info` function tool: ranks the
 * DevStack documentation sections (the same content as /llms.txt and /llms-full.txt) against a
 * free-text query. Any matching term counts (OR), unlike the site search box (AND), because the
 * agent writes natural-language queries. Thai works via substring matching.
 */

const STOP = new Set(["the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "how", "what", "is", "are", "do", "i", "with", "about", "use", "using"]);

export interface DocsInfoResult {
  query: string;
  source: string;
  results: { title: string; heading: string; url: string; markdown_url: string; excerpt: string }[];
  index: string;
}

export function getAgentsSdkInfo(entries: SearchEntry[], query: string, site = "https://devstack.bid", limit = 6): DocsInfoResult {
  const q = normalize(String(query ?? "")).slice(0, 300);
  const terms = [...new Set(q.split(/[\s,.;:!?()"'/]+/).filter((t) => t.length > 1 && !STOP.has(t)))].slice(0, 12);
  const scored: { e: SearchEntry; score: number }[] = [];
  for (const e of entries) {
    const title = normalize(e.title);
    const heading = normalize(e.heading);
    const text = normalize(e.text);
    let score = 0;
    let matched = 0;
    for (const t of terms) {
      const s = (title.includes(t) ? 6 : 0) + (heading.includes(t) ? 4 : 0) + (text.includes(t) ? 1 + Math.min(3, text.split(t).length - 2) : 0);
      if (s) matched++;
      score += s;
    }
    if (!matched) continue;
    score += matched * 3; // reward covering more of the query
    scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const perPage = new Map<string, number>();
  const results = scored
    .filter(({ e }) => {
      const n = perPage.get(e.slug) ?? 0;
      perPage.set(e.slug, n + 1);
      return n < 2;
    })
    .slice(0, limit)
    .map(({ e }) => ({
      title: e.title,
      heading: e.heading,
      url: `${site}/docs${e.slug ? `/${e.slug}` : ""}${e.id ? `#${e.id}` : ""}`,
      markdown_url: `${site}/docs/${e.slug || "index"}.md`,
      excerpt: e.text.slice(0, 900),
    }));
  return { query: q, source: `${site}/llms.txt`, results, index: `${site}/llms.txt` };
}
