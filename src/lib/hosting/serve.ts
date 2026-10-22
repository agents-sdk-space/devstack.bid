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

/** Per-project server Worker name (Next.js/OpenNext sites); only `site-<slug>` names are accepted. */
export const SERVER_WORKER = /^site-[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/;

export async function resolveServerWorker(bucket: R2BucketLike, label: string): Promise<string | null> {
  const o = await bucket.get(`hosts/${label}.json`);
  if (!o) return null;
  const text = o.text ? await o.text() : await new Response(o.body).text();
  try {
    const w = (JSON.parse(text) as { worker?: unknown }).worker;
    return typeof w === "string" && SERVER_WORKER.test(w) ? w : null;
  } catch {
    return null;
  }
}

/** Forward a request to the project's own Worker on workers.dev, keeping method, path, query and body. */
export async function proxyToWorker(req: Request, worker: string, subdomain: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(req.url);
  const target = new URL(`${url.pathname}${url.search}`, `https://${worker}.${subdomain}.workers.dev`);
  const headers = new Headers(req.headers);
  headers.set("X-Forwarded-Host", url.hostname);
  headers.set("X-Forwarded-Proto", "https");
  const res = await fetcher(target.toString(), { method: req.method, headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body, redirect: "manual" });
  const out = new Headers(res.headers);
  const loc = out.get("location");
  if (loc) { try { const l = new URL(loc, target); if (l.host === target.host) { l.host = url.host; out.set("location", l.toString()); } } catch { /* keep */ } }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

export async function serveSite(req: Request, bucket: R2BucketLike, domain?: string, opts: { workersSubdomain?: string; fetcher?: typeof fetch } = {}): Promise<Response> {
  if (opts.workersSubdomain) {
    const h = parseHost(new URL(req.url).hostname, domain);
    if (h.kind === "site") {
      const worker = await resolveServerWorker(bucket, h.label);
      if (worker) return proxyToWorker(req, worker, opts.workersSubdomain, opts.fetcher);
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
