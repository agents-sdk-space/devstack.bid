/**
 * Serve a built static site from R2 by hostname (user-site router, separate Worker).
 * R2 layout: hosts/<label>.json → {"deploymentId": "..."}; sites/<deploymentId>/<path>.
 * No cookies, no platform secrets; strict headers so user content cannot frame the platform.
 */
import { parseHost } from "./hostnames";

export interface R2ObjectLike { body: ReadableStream; httpEtag?: string; size?: number; httpMetadata?: { contentType?: string } }
export interface R2BucketLike {
  get(key: string): Promise<(R2ObjectLike & { json?<T>(): Promise<T>; text?(): Promise<string> }) | null>;
  put(key: string, value: ArrayBuffer | Uint8Array | string | ReadableStream, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  avif: "image/avif", ico: "image/x-icon", txt: "text/plain; charset=utf-8", xml: "application/xml", woff: "font/woff", woff2: "font/woff2",
  wasm: "application/wasm", map: "application/json", webmanifest: "application/manifest+json", pdf: "application/pdf", mp4: "video/mp4",
};
export const contentType = (path: string) => TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Robots-Tag": "noindex",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  // Only the platform may frame a user site (AI builder preview); nobody else can clickjack through it.
  "Content-Security-Policy": "frame-ancestors https://devstack.bid",
};

export const REPORT_URL = "https://devstack.bid/report";

/** Small fixed footer added to every HTML page: who built it and where to report abuse. Escaped host only. */
export function reportBadge(host: string): string {
  const h = host.replace(/[^a-z0-9.-]/gi, "");
  return `<a href="${REPORT_URL}?site=${encodeURIComponent(h)}" target="_blank" rel="noopener noreferrer" data-devstack-badge style="position:fixed;right:8px;bottom:8px;z-index:2147483647;font:12px/1.4 system-ui,sans-serif;background:#111;color:#fff;padding:4px 8px;border-radius:6px;text-decoration:none;opacity:.85">Built by a devstack.bid user · Report</a>`;
}

export function injectBadge(html: string, host: string): string {
  const badge = reportBadge(host);
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i >= 0 ? html.slice(0, i) + badge + html.slice(i) : html + badge;
}

/** Safe object path from a URL path: decoded, no traversal, no hidden files. */
export function objectPath(pathname: string): string | null {
  let p: string;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  if (p.includes("\0") || p.includes("\\")) return null;
  const parts = p.split("/").filter(Boolean);
  if (parts.some((x) => x === ".." || x === "." || x.startsWith("."))) return null;
  return parts.join("/");
}

function notFound(msg = "Not found") {
  return new Response(msg, { status: 404, headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function resolveDeployment(bucket: R2BucketLike, label: string): Promise<string | null> {
  const o = await bucket.get(`hosts/${label}.json`);
  if (!o) return null;
  const text = o.text ? await o.text() : await new Response(o.body).text();
  try {
    const id = (JSON.parse(text) as { deploymentId?: unknown }).deploymentId;
    return typeof id === "string" && /^[a-z0-9-]{8,64}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Per-project server Worker name: site-<20 hex of project> or site-<20 hex>-<12 hex of deployment>. */
export const SERVER_WORKER = /^site-[a-f0-9]{20}(?:-[a-f0-9]{12})?$/;
const PLATFORM_WORKER_NAMES = new Set(["nvx-stack-builder", "devstack-sites", "dev", "devtest", "implemented-stream", "odd-violet-5e66", "stack-hub"]);

export async function resolveServerWorker(bucket: R2BucketLike, label: string): Promise<string | null> {
  const o = await bucket.get(`hosts/${label}.json`);
  if (!o) return null;
  const text = o.text ? await o.text() : await new Response(o.body).text();
  try {
    const w = (JSON.parse(text) as { worker?: unknown }).worker;
    return typeof w === "string" && SERVER_WORKER.test(w) && !PLATFORM_WORKER_NAMES.has(w) ? w : null;
  } catch {
    return null;
  }
}

/** Request headers a customer Worker may see. Cookie, Authorization, CF-* and anything else are dropped. */
export const FORWARD_REQUEST_HEADERS = [
  "accept", "accept-language", "content-type", "content-length", "user-agent", "if-none-match", "if-modified-since", "if-match", "range",
  "cache-control", "pragma", "origin", "referer", "x-requested-with",
  "rsc", "next-router-state-tree", "next-router-prefetch", "next-router-segment-prefetch", "next-action", "next-url",
];
/** Response headers never passed through from a customer Worker. */
const DROP_RESPONSE = ["set-cookie", "x-devstack-origin", "x-devstack-proxy", "content-length"];

export function unavailable(status = 503): Response {
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Site temporarily unavailable</title><body style=\"font:16px system-ui;margin:3rem\"><h1>Site temporarily unavailable</h1><p>This devstack.bid site is not responding right now. Please try again shortly.</p></body>",
    { status, headers: { ...BASE_HEADERS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export interface ProxyOpts { proxyKey?: string | null; fetcher?: typeof fetch }

/**
 * Forward a request to the project's own Worker on workers.dev (method, path, query, body kept).
 * Only allowlisted request headers go upstream, plus the per-worker proxy key. On the way back all
 * Set-Cookie headers are removed (no cookie tossing onto devstack.bid), platform security headers
 * and the report badge are applied, and upstream errors that did not come from the project
 * Worker itself become our "Site temporarily unavailable" page.
 */
export async function proxyToWorker(req: Request, worker: string, subdomain: string, opts: ProxyOpts | typeof fetch = {}): Promise<Response> {
  const o: ProxyOpts = typeof opts === "function" ? { fetcher: opts } : opts;
  const fetcher = o.fetcher ?? fetch;
  const url = new URL(req.url);
  // Never resolve the request path against the base: "//evil.com/x" would change the host (open proxy / key leak).
  const expectedHost = `${worker}.${subdomain}.workers.dev`;
  if (!SERVER_WORKER.test(worker) || PLATFORM_WORKER_NAMES.has(worker) || !/^[a-z0-9-]{1,63}$/.test(subdomain)) return unavailable(502);
  const target = new URL(`https://${expectedHost}`);
  target.pathname = url.pathname;
  target.search = url.search;
  if (target.host !== expectedHost || target.protocol !== "https:") return unavailable(502);
  const headers = new Headers();
  for (const k of FORWARD_REQUEST_HEADERS) { const v = req.headers.get(k); if (v !== null) headers.set(k, v); }
  headers.set("X-Forwarded-Host", url.hostname);
  headers.set("X-Forwarded-Proto", "https");
  if (o.proxyKey) headers.set("X-Devstack-Proxy", o.proxyKey);
  let res: Response;
  try {
    res = await fetcher(target.toString(), { method: req.method, headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body, redirect: "manual" });
  } catch {
    return unavailable(502);
  }
  const fromProject = res.headers.get("x-devstack-origin") === "project";
  if (!fromProject && (res.status === 404 || res.status >= 500)) return unavailable(res.status === 404 ? 503 : 502);
  const out = new Headers(res.headers);
  for (const k of DROP_RESPONSE) out.delete(k);
  for (const [k, v] of Object.entries(BASE_HEADERS)) {
    if (k === "Content-Security-Policy") out.append(k, v); // a customer CSP stays; ours adds frame-ancestors on top
    else out.set(k, v);
  }
  const loc = out.get("location");
  if (loc) { try { const l = new URL(loc, target); if (l.host === target.host) { l.host = url.host; out.set("location", l.toString()); } } catch { out.delete("location"); } }
  const type = out.get("content-type") ?? "";
  if (type.toLowerCase().startsWith("text/html") && req.method !== "HEAD" && res.status !== 204 && res.status !== 304 && res.body) {
    const html = await res.text();
    out.delete("content-encoding");
    return new Response(injectBadge(html, url.hostname), { status: res.status, statusText: res.statusText, headers: out });
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

export async function serveSite(req: Request, bucket: R2BucketLike, domain?: string, opts: { workersSubdomain?: string; fetcher?: typeof fetch; proxyKeyFor?: (worker: string) => Promise<string | null> } = {}): Promise<Response> {
  if (opts.workersSubdomain) {
    const h = parseHost(new URL(req.url).hostname, domain);
    if (h.kind === "site") {
      const worker = await resolveServerWorker(bucket, h.label);
      if (worker) {
        // No key → the guard refuses; fail closed with our page instead of leaking upstream errors.
        const key = opts.proxyKeyFor ? await opts.proxyKeyFor(worker) : null;
        return proxyToWorker(req, worker, opts.workersSubdomain, { fetcher: opts.fetcher, proxyKey: key });
      }
    }
  }
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { ...BASE_HEADERS, Allow: "GET, HEAD" } });
  const url = new URL(req.url);
  const host = parseHost(url.hostname, domain);
  if (host.kind !== "site") return notFound("Unknown site");
  const deploymentId = await resolveDeployment(bucket, host.label);
  if (!deploymentId) return notFound("This site has no deployment yet.");
  const path = objectPath(url.pathname);
  if (path === null) return notFound();
  const candidates = path === "" ? ["index.html"] : /\.[a-z0-9]+$/i.test(path) ? [path] : [`${path}.html`, `${path}/index.html`, path];
  for (const c of candidates) {
    const obj = await bucket.get(`sites/${deploymentId}/${c}`);
    if (obj) return fileResponse(req, obj, c, 200, url.hostname);
  }
  // SPA fallback (only when the build produced 200.html) then custom 404.html.
  const spa = await bucket.get(`sites/${deploymentId}/200.html`);
  if (spa && !/\.[a-z0-9]+$/i.test(path)) return fileResponse(req, spa, "200.html", 200, url.hostname);
  const nf = await bucket.get(`sites/${deploymentId}/404.html`);
  if (nf) return fileResponse(req, nf, "404.html", 404, url.hostname);
  return notFound();
}

async function fileResponse(req: Request, obj: R2ObjectLike & { text?(): Promise<string> }, path: string, status: number, host: string): Promise<Response> {
  const immutable = /(^|\/)(_next\/static|assets)\//.test(path) || /\.[0-9a-f]{8,}\.(js|css|woff2?)$/.test(path);
  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    "Content-Type": obj.httpMetadata?.contentType ?? contentType(path),
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
  };
  if (obj.httpEtag) headers.ETag = obj.httpEtag;
  if (obj.httpEtag && req.headers.get("if-none-match") === obj.httpEtag) return new Response(null, { status: 304, headers });
  if (headers["Content-Type"].startsWith("text/html")) {
    if (req.method === "HEAD") return new Response(null, { status, headers });
    const html = obj.text ? await obj.text() : await new Response(obj.body).text();
    return new Response(injectBadge(html, host), { status, headers });
  }
  return new Response(req.method === "HEAD" ? null : obj.body, { status, headers });
}
