import { KNOWN_TEMPLATE_IDS } from "@/data/template-ids";
import docsNav from "@/generated/docs-nav.json";
import { PLUGINS } from "@/lib/plugins/catalog";

const DOC_SLUGS = new Set(docsNav.sections.flatMap((s) => s.pages.map((p) => p.slug)));
const PLUGIN_NAMES = new Set(PLUGINS.map((p) => p.name));

const STATIC = new Set([
  "/",
  "/learn",
  "/templates",
  "/builder",
  "/chat",
  "/chat/dev",
  "/chat/build",
  "/factory",
  "/design",
  "/login",
  "/docs",
  "/plugins",
  "/settings/mcp",
  "/about",
  "/contact",
  "/privacy",
  "/studio",
  "/openapi.json",
  "/llms.txt",
  "/llms-full.txt",
  "/agent-instructions.txt",
  "/support",
  "/status",
  "/careers",
  "/terms",
  "/terms/api",
  "/security",
  "/settings/cli",
  "/settings/connections",
  "/settings/environment",
  "/projects",
  "/new",
  "/design/chat-stream",
  "/design/dst-mascot",
  "/ui-lab",
  "/setup.sh",
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
]);

/** True when this pathname should receive the normal HTML app (not agent 404 markdown). */
export function isKnownSitePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (STATIC.has(path)) return true;
  if (path === "/studio") return true;
  if (path.startsWith("/studio/")) return true;
  if (path === "/mcp" || path.startsWith("/.well-known/")) return true;
  if (path.startsWith("/docs/raw/")) return true;
  if (/^\/docs\/[^/]+\.md$/i.test(path) || path === "/docs.md") return true;
  if (path.startsWith("/docs/")) {
    const slug = path.slice("/docs/".length);
    if (slug === "agents/platform-manifest.json" || slug === "agents/cursor-agents.json") return true;
    return DOC_SLUGS.has(slug);
  }
  const tpl = path.match(/^\/templates\/([^/]+)$/);
  if (tpl) return KNOWN_TEMPLATE_IDS.includes(tpl[1] as (typeof KNOWN_TEMPLATE_IDS)[number]);
  const plug = path.match(/^\/plugins\/([^/]+)$/);
  if (plug) return PLUGIN_NAMES.has(plug[1]);
  if (/^\/projects\/[^/]+$/.test(path)) return true;
  if (/^\/deployments\/[^/]+$/.test(path)) return true;
  if (path.startsWith("/api/")) return true;
  if (path.startsWith("/_next/")) return true;
  if (path.startsWith("/docs-assets/")) return true;
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?|txt|xml|json|map)$/i.test(path)) return true;
  return false;
}
