/**
 * First-party activity tracking (pure helpers, unit-tested). Privacy rules:
 * - only after the visitor opts in to "analytics" (cookie nvx_analytics=1); Sec-GPC / DNT always win;
 * - a random anonymous id (cookie nvx_vid), a clean path (no query/hash), an allow-listed CTA id, or a chat *topic category*;
 * - never message text, IPs, user agents or account ids. Rows older than 30 days are pruned.
 */
export type ActivityType = "pageview" | "click" | "topic";

export const TOPICS: Record<string, RegExp> = {
  deploy: /\b(deploy|build|ship|release|cloudflare|worker|edge|preview|hosting)\b|ดีพลอย|ขึ้นเว็บ|โฮสต์/i,
  git: /\b(git|github|repo|push|commit|branch|pull request)\b|พุช/i,
  templates: /\b(template|stack|starter|scaffold|boilerplate)\b|เทมเพลต/i,
  python: /\b(python|pip|pypi|django|fastapi|flask)\b/i,
  node: /\b(node|npm|npx|nvm|next\.?js|react|vite|nuxt)\b/i,
  mcp: /\b(mcp|cursor|claude|agent|tool call)\b|เอเจนต์/i,
  ai: /\b(ai|llm|model|prompt|chatbot|gpt)\b|บอท/i,
  errors: /\b(error|fail(ed)?|bug|crash|broken|not working)\b|พัง|ไม่ได้|ผิดพลาด|error/i,
  pricing: /\b(price|pricing|cost|free|plan|billing|credit)\b|ราคา|ฟรี|เครดิต/i,
};

export function classify(text: string): string[] {
  const t = String(text ?? "").slice(0, 4000);
  const out = Object.keys(TOPICS).filter((k) => TOPICS[k].test(t));
  return out.length ? out.slice(0, 3) : ["other"];
}

export const CTAS = new Set(["hero_deploy", "hero_browse", "cta_deploy", "cta_browse", "nav_new", "nav_templates", "nav_docs", "nav_chat", "suggest", "login", "template_open"]);

export function cleanPath(p: unknown): string {
  let s = String(p ?? "/").split(/[?#]/)[0].slice(0, 120);
  if (!s.startsWith("/")) s = "/" + s;
  return s.replace(/[^\w\-/.]/g, "").replace(/\/[0-9a-f-]{16,}/gi, "/:id");
}

export const VID_RE = /^[a-z0-9]{16,40}$/i;

export function cookieValue(header: string | null, name: string): string | null {
  const m = (header ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Anonymous visitor id if (and only if) this request may be tracked. */
export function visitorOf(req: Request): string | null {
  const h = req.headers;
  if (h.get("sec-gpc") === "1" || h.get("dnt") === "1") return null;
  const c = h.get("cookie");
  if (cookieValue(c, "nvx_analytics") !== "1") return null;
  const v = cookieValue(c, "nvx_vid") ?? "";
  return VID_RE.test(v) ? v : null;
}

export type Suggestion = { title: string; href: string; kind: "doc" | "template" | "prompt"; reason?: string };
export const CATALOG: Record<string, Suggestion[]> = {
  deploy: [{ title: "Deploy a project", href: "/new", kind: "template" }, { title: "Deploy docs", href: "/docs", kind: "doc" }, { title: "Why did my build fail?", href: "/chat", kind: "prompt" }],
  git: [{ title: "Import from GitHub", href: "/new", kind: "template" }, { title: "Push to deploy", href: "/chat", kind: "prompt" }],
  templates: [{ title: "Browse Stack Templates", href: "/templates", kind: "template" }, { title: "Open the builder", href: "/builder", kind: "template" }],
  python: [{ title: "Python templates", href: "/templates", kind: "template" }, { title: "Scaffold a FastAPI app", href: "/chat", kind: "prompt" }],
  node: [{ title: "Node.js templates", href: "/templates", kind: "template" }, { title: "Scaffold a Next.js app", href: "/chat", kind: "prompt" }],
  mcp: [{ title: "Docs", href: "/docs", kind: "doc" }, { title: "Create an MCP key", href: "/settings/mcp", kind: "doc" }],
  ai: [{ title: "Ask the AI builder", href: "/chat", kind: "prompt" }, { title: "AI app templates", href: "/templates", kind: "template" }],
  errors: [{ title: "Support", href: "/support", kind: "doc" }, { title: "Service status", href: "/status", kind: "doc" }, { title: "Debug my deployment", href: "/chat", kind: "prompt" }],
  pricing: [{ title: "Support & plans", href: "/support", kind: "doc" }],
  start: [{ title: "Deploy a project", href: "/new", kind: "template" }, { title: "Browse Stack Templates", href: "/templates", kind: "template" }, { title: "Ask the AI builder", href: "/chat", kind: "prompt" }],
};

export function pathInterest(path: string, target?: string | null): string | null {
  if (target === "template_open" || /^\/(templates|builder|factory)/.test(path)) return "templates";
  if (/^\/(new|projects)/.test(path)) return "deploy";
  if (/^\/(mcp|settings\/mcp)/.test(path)) return "mcp";
  if (/^\/(support|status)/.test(path)) return "errors";
  if (/^\/chat/.test(path)) return "ai";
  return null;
}

/** Rank interests from a visitor's own events (newest first) and pick up to 6 suggestions. */
export function suggest(events: { type: string; path: string | null; target: string | null; topic: string | null }[]) {
  const score: Record<string, number> = {};
  events.forEach((r, i) => {
    const w = (1 / (1 + i / 10)) * (r.type === "topic" ? 3 : r.type === "click" ? 2 : 1);
    const k = r.type === "topic" ? r.topic : pathInterest(r.path ?? "", r.target);
    if (k && CATALOG[k]) score[k] = (score[k] ?? 0) + w;
  });
  const interests = Object.entries(score).sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 3);
  if (!interests.length) return { personalized: false, interests: [] as string[], items: CATALOG.start };
  const seen = new Set<string>(), items: Suggestion[] = [];
  for (const k of interests) for (const it of CATALOG[k]) if (!seen.has(it.title) && items.length < 6) { seen.add(it.title); items.push({ ...it, reason: k }); }
  return { personalized: true, interests, items };
}
