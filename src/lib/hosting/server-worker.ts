/**
 * Per-project server Workers (Next.js via OpenNext, or any Worker bundle) for plans without
 * Workers for Platforms. The build container bundles the app (`wrangler deploy --dry-run`) into
 *   server.json            (ignored: runtime settings are platform-controlled)
 *   worker/worker.js       single ES module
 *   assets/**              static assets served by the ASSETS binding
 * The platform uploads it as Worker `site-<hash(projectId)>` (production) or
 * `site-<hash(projectId)>-<hash(deploymentId)>` (preview) with the Cloudflare API, wrapped in a
 * platform guard module that only answers requests carrying the per-worker proxy key that
 * devstack-sites injects. The API token never enters the container (SITES_CF_API_TOKEN).
 */
import { SERVER_WORKER } from "./serve";

export interface BundleFile { path: string; bytes: Uint8Array }
export interface ServerBundle { worker: Uint8Array; assets: BundleFile[]; compatibilityDate: string; compatibilityFlags: string[] }

/** Platform-fixed runtime settings. Customers cannot change them (SSRF: global_fetch_strictly_public stays on). */
export const SERVER_COMPAT_DATE = "2026-10-01";
export const SERVER_COMPAT_FLAGS = Object.freeze(["nodejs_compat", "global_fetch_strictly_public"]) as readonly string[];
export const MAX_WORKER_BYTES = 10 * 1024 * 1024;

/** Every Worker that exists on the platform account and is not a customer site. Never writable by a build. */
export const PLATFORM_WORKERS = new Set(["nvx-stack-builder", "devstack-sites", "dev", "devtest", "implemented-stream", "odd-violet-5e66", "stack-hub"]);

async function hex(s: string, n: number): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, n);
}

/** Hard gate for any Worker name the platform will PUT or proxy to. */
export function assertCustomerWorker(name: string): string {
  if (typeof name !== "string" || !SERVER_WORKER.test(name) || PLATFORM_WORKERS.has(name)) throw new Error("invalid_worker_name");
  return name;
}

/**
 * Worker name from ids, never from the (reusable) slug. Production: one per project.
 * Preview: one per deployment, so a preview build can never replace production code.
 */
export async function serverWorkerName(projectId: string, deploymentId?: string | null): Promise<string> {
  if (!projectId) throw new Error("invalid_project");
  const base = `site-${await hex(`project:${projectId}`, 20)}`;
  return assertCustomerWorker(deploymentId ? `${base}-${await hex(`deployment:${deploymentId}`, 12)}` : base);
}

/** Per-worker proxy key = HMAC-SHA256(master, workerName). A customer only ever learns its own key. */
export async function proxyKey(master: string, worker: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(master), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`devstack-proxy:${worker}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Split a build artifact into a server bundle, or null when it is a plain static site. server.json content is ignored. */
export function readServerBundle(files: BundleFile[]): ServerBundle | null {
  const strip = (p: string) => p.replace(/^\.\//, "");
  const meta = files.find((f) => strip(f.path) === "server.json");
  const worker = files.find((f) => strip(f.path) === "worker/worker.js");
  if (!meta || !worker) return null;
  if (worker.bytes.length > MAX_WORKER_BYTES) throw new Error("worker_too_large");
  const assets = files
    .filter((f) => strip(f.path).startsWith("assets/") && !strip(f.path).endsWith("/"))
    .map((f) => ({ path: "/" + strip(f.path).slice("assets/".length), bytes: f.bytes }))
    .filter((f) => f.path.length > 1 && !f.path.includes(".."));
  return { worker: worker.bytes, assets, compatibilityDate: SERVER_COMPAT_DATE, compatibilityFlags: [...SERVER_COMPAT_FLAGS] };
}

/**
 * Platform guard, uploaded as the main module. Rejects anything without the proxy key (direct
 * workers.dev hits), hides the key from customer code, and marks real project responses.
 */
export const GUARD_MODULE = `import * as user from "./worker.js";
export * from "./worker.js";
const h = user.default;
function same(a, b) { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
export default {
  async fetch(req, env, ctx) {
    const { DEVSTACK_PROXY_KEY: key, ...rest } = env || {};
    if (!key || !same(req.headers.get("x-devstack-proxy"), key)) return new Response("Not found", { status: 404, headers: { "x-devstack-origin": "guard", "cache-control": "no-store" } });
    const hs = new Headers(req.headers); hs.delete("x-devstack-proxy");
    const r = await h.fetch(new Request(req, { headers: hs }), rest, ctx);
    if (!r || r.status === 101 || r.webSocket) return r;
    const out = new Response(r.body, r); out.headers.set("x-devstack-origin", "project"); return out;
  },
};
`;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function assetHash(f: BundleFile): Promise<string> {
  const ext = f.path.includes(".") ? f.path.slice(f.path.lastIndexOf(".") + 1) : "";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b64(f.bytes) + ext));
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CfApi { accountId: string; token: string; proxySecret?: string; fetcher?: typeof fetch }

/** Cloudflare API failure. `detail` is for server logs only; users see `code`. */
export class CfApiError extends Error {
  constructor(public status: number, public cfCode: number | null, public detail: string) { super(`cf_api_${status}${cfCode ? `_${cfCode}` : ""}`); }
  get code() { return this.message; }
}

async function call<T>(api: CfApi, path: string, init: RequestInit, bearer = api.token): Promise<T> {
  const f = api.fetcher ?? fetch;
  const res = await f(`https://api.cloudflare.com/client/v4/accounts/${api.accountId}${path}`, { ...init, headers: { Authorization: `Bearer ${bearer}`, ...(init.headers ?? {}) } });
  const body = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { code?: number; message?: string }[] } | null;
  if (!res.ok || !body?.success) {
    const e = body?.errors?.[0];
    throw new CfApiError(res.status, typeof e?.code === "number" ? e.code : null, String(e?.message ?? "").slice(0, 300));
  }
  return body.result as T;
}

export const OWNER_TAG = (projectId: string) => `devstack-project-${projectId.replace(/[^a-zA-Z0-9-]/g, "")}`.slice(0, 120);

/** Owner tag of an existing Worker; null = does not exist. Throws `worker_owner_mismatch` when owned by someone else. */
export async function checkOwnership(api: CfApi, name: string, projectId: string): Promise<"new" | "owned"> {
  try {
    const s = await call<{ tags?: string[] | null }>(api, `/workers/scripts/${name}/script-settings`, { method: "GET" });
    if ((s?.tags ?? []).includes(OWNER_TAG(projectId))) return "owned";
    throw new Error("worker_owner_mismatch");
  } catch (e) {
    if (e instanceof CfApiError && (e.status === 404 || e.cfCode === 10007)) return "new";
    throw e;
  }
}

/** Upload (create or replace) Worker `name` for `projectId` with its assets and the guard; enable its workers.dev URL. */
export async function deployServerWorker(api: CfApi, name: string, b: ServerBundle, projectId: string): Promise<{ versionId: string | null; assets: number }> {
  assertCustomerWorker(name);
  if (!api.proxySecret) throw new Error("proxy_secret_missing");
  await checkOwnership(api, name, projectId);
  const byHash = new Map<string, BundleFile>();
  const manifest: Record<string, { hash: string; size: number }> = {};
  for (const f of b.assets) {
    const hash = await assetHash(f);
    byHash.set(hash, f);
    manifest[f.path] = { hash, size: f.bytes.length };
  }
  let completion: string | null = null;
  if (b.assets.length) {
    const session = await call<{ jwt: string; buckets?: string[][] }>(api, `/workers/scripts/${name}/assets-upload-session`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifest }),
    });
    completion = session.jwt;
    for (const bucket of session.buckets ?? []) {
      const form = new FormData();
      for (const h of bucket) { const f = byHash.get(h); if (f) form.append(h, b64(f.bytes)); }
      const r = await call<{ jwt?: string } | null>(api, `/workers/assets/upload?base64=true`, { method: "POST", body: form }, session.jwt);
      if (r && r.jwt) completion = r.jwt;
    }
  }
  const bindings: Record<string, unknown>[] = [{ type: "secret_text", name: "DEVSTACK_PROXY_KEY", text: await proxyKey(api.proxySecret, name) }];
  if (completion) bindings.push({ type: "assets", name: "ASSETS" });
  const metadata: Record<string, unknown> = {
    main_module: "devstack-guard.js",
    compatibility_date: SERVER_COMPAT_DATE,
    compatibility_flags: [...SERVER_COMPAT_FLAGS],
    bindings,
    tags: [OWNER_TAG(projectId)],
    observability: { enabled: true },
  };
  if (completion) metadata.assets = { jwt: completion, config: { html_handling: "auto-trailing-slash", not_found_handling: "none" } };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("devstack-guard.js", new Blob([GUARD_MODULE], { type: "application/javascript+module" }), "devstack-guard.js");
  form.append("worker.js", new Blob([b.worker as BlobPart], { type: "application/javascript+module" }), "worker.js");
  const up = await call<{ id?: string; deployment_id?: string | null }>(api, `/workers/scripts/${name}`, { method: "PUT", body: form });
  await call(api, `/workers/scripts/${name}/subdomain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true, previews_enabled: false }) });
  return { versionId: up?.deployment_id ?? up?.id ?? null, assets: b.assets.length };
}
