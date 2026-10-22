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
import { PLATFORM_WORKERS, PREVIEW_WORKER, SERVER_WORKER, type R2BucketLike } from "./serve";
export { PLATFORM_WORKERS };

export interface BundleFile { path: string; bytes: Uint8Array }
export interface ExtraModule { name: string; bytes: Uint8Array; type: string }
export interface ServerBundle { worker: Uint8Array; assets: BundleFile[]; compatibilityDate: string; compatibilityFlags: string[]; modules?: ExtraModule[] }

/** Extra modules wrangler emits next to worker.js (e.g. resvg/yoga .wasm for next/og). */
const MODULE_TYPES: Record<string, string> = { wasm: "application/wasm", js: "application/javascript+module", mjs: "application/javascript+module", cjs: "application/javascript", txt: "text/plain", bin: "application/octet-stream", html: "text/plain", sql: "text/plain" };
const MODULE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Platform-fixed runtime settings. Customers cannot change them (SSRF: global_fetch_strictly_public stays on). */
export const SERVER_COMPAT_DATE = "2026-10-01";
export const SERVER_COMPAT_FLAGS = Object.freeze(["nodejs_compat", "global_fetch_strictly_public"]) as readonly string[];
export const MAX_WORKER_BYTES = 10 * 1024 * 1024;


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
/** The 20-hex project part of every server Worker name. Shared by naming and cleanup (must never diverge). */
export const projectHash = (projectId: string) => hex(`project:${projectId}`, 20);

export async function serverWorkerName(projectId: string, deploymentId?: string | null): Promise<string> {
  if (!projectId) throw new Error("invalid_project");
  const base = `site-${await projectHash(projectId)}`;
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
  const modules: ExtraModule[] = [];
  for (const f of files) {
    const p = strip(f.path);
    if (!p.startsWith("worker/") || p === "worker/worker.js" || p.endsWith("/") || p.endsWith(".map") || p.endsWith("README.md")) continue;
    const name = p.slice("worker/".length);
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    // Flat names only; the guard's own module name is reserved.
    if (!MODULE_NAME.test(name) || name === "devstack-guard.js" || !MODULE_TYPES[ext]) continue;
    modules.push({ name, bytes: f.bytes, type: MODULE_TYPES[ext] });
  }
  if (modules.length > 50) throw new Error("too_many_modules");
  if (worker.bytes.length + modules.reduce((n, m) => n + m.bytes.length, 0) > MAX_WORKER_BYTES * 3) throw new Error("worker_too_large");
  if (worker.bytes.length > MAX_WORKER_BYTES) throw new Error("worker_too_large");
  const assets = files
    .filter((f) => strip(f.path).startsWith("assets/") && !strip(f.path).endsWith("/"))
    .map((f) => ({ path: "/" + strip(f.path).slice("assets/".length), bytes: f.bytes }))
    .filter((f) => f.path.length > 1 && !f.path.includes(".."));
  return { worker: worker.bytes, assets, compatibilityDate: SERVER_COMPAT_DATE, compatibilityFlags: [...SERVER_COMPAT_FLAGS], modules };
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
    const tags = s?.tags ?? [];
    if (tags.includes(OWNER_TAG(projectId))) return "owned";
    if (!tags.length) {
      // An assets-upload session creates an empty placeholder (no versions, no tags) before the first PUT.
      // If that PUT failed, the placeholder has no code at all, so it can be claimed.
      const v = await call<{ items?: unknown[] }>(api, `/workers/scripts/${name}/versions`, { method: "GET" });
      if (!(v?.items ?? []).length) return "new";
    }
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
  for (const m of b.modules ?? []) form.append(m.name, new Blob([m.bytes as BlobPart], { type: m.type }), m.name);
  const up = await call<{ id?: string; deployment_id?: string | null }>(api, `/workers/scripts/${name}`, { method: "PUT", body: form });
  await call(api, `/workers/scripts/${name}/subdomain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true, previews_enabled: false }) });
  return { versionId: up?.deployment_id ?? up?.id ?? null, assets: b.assets.length };
}

export interface CleanupOpts { maxAgeDays?: number; keepPerProject?: number; now?: number; max?: number; bucket?: R2BucketLike | null }

/** Project id from an owner tag, if the tag is ours. */
export function tagProject(tags: string[] | null | undefined): string | null {
  const t = (tags ?? []).find((x) => x.startsWith("devstack-project-"));
  return t ? t.slice("devstack-project-".length) || null : null;
}

/** R2 index of hostnames that point at a Worker (written by publishServer, used by cleanup). */
export const workerIndexKey = (worker: string) => `workers/${worker}.json`;

/**
 * Delete old preview Workers. A Worker is deleted only when ALL hold:
 *  - its name matches PREVIEW_WORKER (site-<20hex>-<12hex>; production/platform names never match),
 *  - it is NOT among the newest `keepPerProject` (default 5) previews of its project (these are always kept),
 *  - it is older than `maxAgeDays` (default 14),
 *  - its owner tag is ours AND sha256("project:"+tagged id)[0:20] equals the project hash in the name.
 * Host aliases that still point at a deleted Worker are removed, so its preview URL shows "preview expired".
 */
export async function cleanupPreviewWorkers(api: CfApi, o: CleanupOpts = {}): Promise<string[]> {
  const now = o.now ?? Date.now();
  const maxAge = (o.maxAgeDays ?? 14) * 86_400_000;
  const keep = o.keepPerProject ?? 5;
  const list = await call<{ id: string; created_on?: string; modified_on?: string }[]>(api, "/workers/scripts", { method: "GET" });
  const byProject = new Map<string, { id: string; at: number }[]>();
  for (const s of list ?? []) {
    if (!PREVIEW_WORKER.test(s.id) || PLATFORM_WORKERS.has(s.id)) continue;
    const at = Date.parse(s.modified_on ?? s.created_on ?? "") || 0;
    const k = s.id.slice(0, "site-".length + 20);
    byProject.set(k, [...(byProject.get(k) ?? []), { id: s.id, at }]);
  }
  const doomed: string[] = [];
  for (const arr of byProject.values()) {
    arr.sort((a, b) => b.at - a.at);
    arr.forEach((w, i) => { if (i >= keep && now - w.at > maxAge) doomed.push(w.id); });
  }
  const deleted: string[] = [];
  for (const name of doomed.slice(0, o.max ?? 25)) {
    const st = await call<{ tags?: string[] | null }>(api, `/workers/scripts/${name}/script-settings`, { method: "GET" }).catch(() => null);
    const pid = tagProject(st?.tags);
    if (!pid || `site-${await projectHash(pid)}` !== name.slice(0, "site-".length + 20)) continue; // not provably ours
    const ok = await call(api, `/workers/scripts/${name}?force=true`, { method: "DELETE" }).then(() => true).catch(() => false);
    if (!ok) continue;
    deleted.push(name);
    if (o.bucket) await removeAliases(o.bucket, name).catch(() => null);
  }
  return deleted;
}

async function readJson<T>(bucket: R2BucketLike, key: string): Promise<T | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  const text = obj.text ? await obj.text() : await new Response(obj.body).text();
  try { return JSON.parse(text) as T; } catch { return null; }
}

/** Remove hosts/<label>.json records that still point at `worker`, then the index itself. */
export async function removeAliases(bucket: R2BucketLike, worker: string): Promise<string[]> {
  if (!bucket.delete) return [];
  const idx = await readJson<{ labels?: string[] }>(bucket, workerIndexKey(worker));
  const removed: string[] = [];
  for (const label of idx?.labels ?? []) {
    if (!/^[a-z0-9-]{1,63}$/.test(label)) continue;
    const rec = await readJson<{ worker?: string; projectId?: string }>(bucket, `hosts/${label}.json`);
    // Keep a tombstone (same owner) so the host answers 410 "preview expired" and can't be claimed by another project.
    if (rec?.worker === worker) { await bucket.put(`hosts/${label}.json`, JSON.stringify({ projectId: rec.projectId ?? null, expired: true, updatedAt: Date.now() }), { httpMetadata: { contentType: "application/json" } }); removed.push(label); }
  }
  await bucket.delete(workerIndexKey(worker));
  return removed;
}
