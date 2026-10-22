/**
 * Per-project server Workers (Next.js via OpenNext, or any Worker bundle) for plans without
 * Workers for Platforms. The build container bundles the app (`wrangler deploy --dry-run`) into
 *   server.json            { compatibility_date, compatibility_flags }
 *   worker/worker.js       single ES module
 *   assets/**              static assets served by the ASSETS binding
 * and the platform uploads it as Worker `site-<slug>` with the Cloudflare API. devstack-sites then
 * proxies <slug>.devstack.bid to site-<slug>.<subdomain>.workers.dev (see serve.ts).
 * The API token never enters the container; it is a platform secret (SITES_CF_API_TOKEN).
 */
import { SERVER_WORKER } from "./serve";

export interface BundleFile { path: string; bytes: Uint8Array }
export interface ServerBundle { worker: Uint8Array; assets: BundleFile[]; compatibilityDate: string; compatibilityFlags: string[] }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FLAG = /^[a-z0-9_]{1,64}$/;
export const MAX_WORKER_BYTES = 10 * 1024 * 1024;

export function serverWorkerName(slug: string): string {
  const name = `site-${slug}`.slice(0, 63).replace(/-+$/, "");
  if (!SERVER_WORKER.test(name)) throw new Error("invalid_slug");
  return name;
}

/** Split a build artifact into a server bundle, or null when it is a plain static site. */
export function readServerBundle(files: BundleFile[]): ServerBundle | null {
  const strip = (p: string) => p.replace(/^\.\//, "");
  const meta = files.find((f) => strip(f.path) === "server.json");
  const worker = files.find((f) => strip(f.path) === "worker/worker.js");
  if (!meta || !worker) return null;
  let m: { compatibility_date?: unknown; compatibility_flags?: unknown } = {};
  try { m = JSON.parse(new TextDecoder().decode(meta.bytes)); } catch { throw new Error("invalid_server_json"); }
  const date = typeof m.compatibility_date === "string" && DATE.test(m.compatibility_date) ? m.compatibility_date : "2026-10-01";
  const flags = Array.isArray(m.compatibility_flags) ? m.compatibility_flags.filter((f): f is string => typeof f === "string" && FLAG.test(f)).slice(0, 20) : [];
  if (!flags.includes("nodejs_compat")) flags.push("nodejs_compat");
  if (worker.bytes.length > MAX_WORKER_BYTES) throw new Error("worker_too_large");
  const assets = files
    .filter((f) => strip(f.path).startsWith("assets/") && !strip(f.path).endsWith("/"))
    .map((f) => ({ path: "/" + strip(f.path).slice("assets/".length), bytes: f.bytes }))
    .filter((f) => f.path.length > 1 && !f.path.includes(".."));
  return { worker: worker.bytes, assets, compatibilityDate: date, compatibilityFlags: flags };
}

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

export interface CfApi { accountId: string; token: string; fetcher?: typeof fetch }

async function call<T>(api: CfApi, path: string, init: RequestInit, bearer = api.token): Promise<T> {
  const f = api.fetcher ?? fetch;
  const res = await f(`https://api.cloudflare.com/client/v4/accounts/${api.accountId}${path}`, { ...init, headers: { Authorization: `Bearer ${bearer}`, ...(init.headers ?? {}) } });
  const body = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { code?: number; message?: string }[] } | null;
  if (!res.ok || !body?.success) {
    const e = body?.errors?.[0];
    throw new Error(`cf_api ${res.status}${e ? ` ${e.code ?? ""} ${String(e.message ?? "").slice(0, 160)}` : ""}`.trim());
  }
  return body.result as T;
}

/** Upload (create or replace) Worker `name` with its assets and enable its workers.dev URL. */
export async function deployServerWorker(api: CfApi, name: string, b: ServerBundle): Promise<{ versionId: string | null; assets: number }> {
  if (!SERVER_WORKER.test(name)) throw new Error("invalid_worker_name");
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
  const metadata: Record<string, unknown> = {
    main_module: "worker.js",
    compatibility_date: b.compatibilityDate,
    compatibility_flags: b.compatibilityFlags,
    bindings: completion ? [{ type: "assets", name: "ASSETS" }] : [],
    observability: { enabled: true },
  };
  if (completion) metadata.assets = { jwt: completion, config: { html_handling: "auto-trailing-slash", not_found_handling: "none" } };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("worker.js", new Blob([b.worker as BlobPart], { type: "application/javascript+module" }), "worker.js");
  const up = await call<{ id?: string; deployment_id?: string | null }>(api, `/workers/scripts/${name}`, { method: "PUT", body: form });
  await call(api, `/workers/scripts/${name}/subdomain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true, previews_enabled: false }) });
  return { versionId: up?.deployment_id ?? up?.id ?? null, assets: b.assets.length };
}
