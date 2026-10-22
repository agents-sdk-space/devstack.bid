/**
 * Public URLs for built sites (like *.vercel.app):
 *   production: <slug>.<domain>           e.g. my-app.devstack.bid
 *   preview:    <slug>-<shortid>.<domain> e.g. my-app-k3x9q2.devstack.bid
 * One DNS label each (covered by a single *.<domain> wildcard certificate).
 */
export const PLATFORM_DOMAIN = "devstack.bid";

/** Labels that must never be handed to a user site (platform hosts and look-alikes). */
export const RESERVED = new Set(["www", "api", "app", "admin", "auth", "login", "mail", "smtp", "mx", "ns1", "ns2", "cdn", "static", "assets", "status", "docs", "studio", "mcp", "dev", "staging", "preview", "sites", "builds", "dashboard", "support", "billing", "github", "cloudflare"]);

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SHORT_ID = /^[a-z0-9]{6}$/;
const SLUG_MAX = 63 - 7; // leave room for "-" + 6-char preview id inside one 63-char label

/** Normalise a project name into a DNS-safe slug, or null if nothing usable remains. */
export function siteSlug(name: string): string | null {
  const s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, SLUG_MAX).replace(/-+$/g, "");
  if (!s || !LABEL.test(s) || RESERVED.has(s) || /^xn--/.test(s)) return null;
  return s;
}

/** 6-char base36 id derived from a deployment id (stable, lowercase). */
export function shortId(deploymentId: string): string {
  const hex = deploymentId.replace(/[^0-9a-f]/gi, "").slice(0, 12) || "0";
  return BigInt(`0x${hex}`).toString(36).padStart(6, "0").slice(-6);
}

export function productionHost(slug: string, domain = PLATFORM_DOMAIN): string {
  if (!LABEL.test(slug) || RESERVED.has(slug)) throw new Error("invalid slug");
  return `${slug}.${domain}`;
}

export function previewHost(slug: string, deploymentId: string, domain = PLATFORM_DOMAIN): string {
  const label = `${slug}-${shortId(deploymentId)}`;
  if (!LABEL.test(label)) throw new Error("invalid slug");
  return `${label}.${domain}`;
}

export type ParsedHost = { kind: "platform" } | { kind: "site"; label: string } | { kind: "foreign" };

/** Classify a request Host header. Apex and reserved labels belong to the platform, never to a site. */
export function parseHost(host: string | null | undefined, domain = PLATFORM_DOMAIN): ParsedHost {
  const h = String(host ?? "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (h === domain) return { kind: "platform" };
  if (!h.endsWith(`.${domain}`)) return { kind: "foreign" };
  const label = h.slice(0, -domain.length - 1);
  if (label.includes(".") || !LABEL.test(label)) return { kind: "foreign" };
  if (RESERVED.has(label)) return { kind: "platform" };
  return { kind: "site", label };
}

export { SHORT_ID };
