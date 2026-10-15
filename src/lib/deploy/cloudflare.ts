import { DeployError, type DeployFile, type DeployInput, type DeployOutput, type DeployProvider } from "./provider";
import type { DeployProfile } from "./templates";

/**
 * Option A: upload straight into the customer's Cloudflare account with THEIR token
 * (Workers Scripts: Edit + Account Settings: Read). Only for profiles with path "direct"
 * (no build step): static assets (worker-assets) or a plain ESM Worker (worker-script).
 * Flow: assets-upload-session → upload buckets → PUT script (multipart) → enable workers.dev.
 */

const CF = "https://api.cloudflare.com/client/v4";
export const COMPAT_DATE = "2026-10-01";

/** Tiny module that serves the uploaded assets (asset-only Workers still need an entry via the API). */
export const ASSETS_ENTRY = `export default { fetch(request, env) { return env.ASSETS.fetch(request); } };\n`;

const MIME: Record<string, string> = {
  html: "text/html", css: "text/css", js: "application/javascript", mjs: "application/javascript", json: "application/json",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  ico: "image/x-icon", txt: "text/plain", woff2: "font/woff2", wasm: "application/wasm", xml: "application/xml",
};
const ext = (p: string) => (p.includes(".") ? p.split(".").pop()!.toLowerCase() : "");

function b64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** 32-hex content hash per asset (wrangler uses blake3; the API treats it as an opaque content key). */
export async function assetHash(bytes: Uint8Array, path: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b64(bytes) + ext(path)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** Files that are repo plumbing, not site content. */
export function isAssetFile(path: string): boolean {
  return !/^(\.|README|LICENSE|wrangler\.(jsonc?|toml)$|package(-lock)?\.json$|node_modules\/)/i.test(path) && !path.includes("/.");
}

type Fetch = typeof fetch;

async function cf<T>(f: Fetch, token: string, method: string, path: string, body?: BodyInit, json = true): Promise<T> {
  const res = await f(`${CF}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(json && body ? { "Content-Type": "application/json" } : {}) }, body });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { code?: number; message?: string }[] };
  if (!res.ok || data.success === false) {
    const first = data.errors?.[0];
    const code = res.status === 401 || res.status === 403 ? "cf_auth" : res.status === 413 ? "cf_too_large" : "cf_api";
    throw new DeployError(code, `${method} ${path.replace(/accounts\/[a-f0-9]{32}/, "accounts/…")} → ${res.status} ${first?.code ?? ""} ${first?.message ?? ""}`.trim());
  }
  return data.result as T;
}

export async function uploadAssets(f: Fetch, token: string, account: string, name: string, files: DeployFile[]): Promise<string> {
  const byHash = new Map<string, DeployFile>();
  const manifest: Record<string, { hash: string; size: number }> = {};
  for (const file of files) {
    const hash = await assetHash(file.bytes, file.path);
    byHash.set(hash, file);
    manifest[`/${file.path}`] = { hash, size: file.bytes.length };
  }
  const session = await cf<{ jwt: string; buckets?: string[][] }>(f, token, "POST", `/accounts/${account}/workers/scripts/${name}/assets-upload-session`, JSON.stringify({ manifest }));
  let completion = session.jwt;
  for (const bucket of session.buckets ?? []) {
    const form = new FormData();
    for (const h of bucket) {
      const file = byHash.get(h);
      if (file) form.append(h, new File([b64(file.bytes)], h, { type: MIME[ext(file.path)] ?? "application/octet-stream" }));
    }
    const res = await f(`${CF}/accounts/${account}/workers/assets/upload?base64=true`, { method: "POST", headers: { Authorization: `Bearer ${session.jwt}` }, body: form });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; result?: { jwt?: string } };
    if (!res.ok || data.success === false) throw new DeployError("cf_assets", `assets upload → ${res.status}`);
    if (data.result?.jwt) completion = data.result.jwt;
  }
  return completion;
}

export function scriptMetadata(profile: DeployProfile, mainModule: string, assetsJwt: string | null) {
  return {
    main_module: mainModule,
    compatibility_date: COMPAT_DATE,
    ...(assetsJwt ? { assets: { jwt: assetsJwt, config: profile.spa ? { not_found_handling: "single-page-application" } : { html_handling: "auto-trailing-slash" } }, bindings: [{ type: "assets", name: "ASSETS" }] } : { bindings: [] }),
  };
}

export function createCloudflareProvider(f: Fetch = fetch): DeployProvider {
  return {
    id: "cloudflare",
    credentialKind: "cloudflare",
    target: "cf-workers",
    supports: (p) => p.path === "direct" && (p.target === "worker-assets" || p.target === "worker-script"),
    async deploy(input: DeployInput, onStatus): Promise<DeployOutput> {
      const token = input.credential.secret;
      const account = input.credential.meta.account_id;
      if (!account) throw new DeployError("cf_account_missing", "Cloudflare account id missing; reconnect Cloudflare.");
      const { profile, name } = input;
      await onStatus("uploading");
      const form = new FormData();
      let main = "index.js";
      let assetsJwt: string | null = null;
      if (profile.target === "worker-assets") {
        const assets = input.files.filter((x) => isAssetFile(x.path));
        if (!assets.some((x) => x.path === "index.html")) throw new DeployError("missing_index", "index.html not found at the repo root.");
        assetsJwt = await uploadAssets(f, token, account, name, assets);
        form.append(main, new File([ASSETS_ENTRY], main, { type: "application/javascript+module" }));
      } else {
        main = profile.entry ?? "src/index.js";
        const modules = input.files.filter((x) => /\.m?js$/.test(x.path));
        if (!modules.some((x) => x.path === main)) throw new DeployError("missing_entry", `${main} not found.`);
        for (const m of modules) form.append(m.path, new File([m.bytes as BlobPart], m.path, { type: "application/javascript+module" }));
      }
      form.append("metadata", new Blob([JSON.stringify(scriptMetadata(profile, main, assetsJwt))], { type: "application/json" }));
      const put = await cf<{ id?: string; etag?: string; deployment_id?: string }>(f, token, "PUT", `/accounts/${account}/workers/scripts/${name}`, form, false);
      await cf(f, token, "POST", `/accounts/${account}/workers/scripts/${name}/subdomain`, JSON.stringify({ enabled: true, previews_enabled: false }));
      const sub = await cf<{ subdomain?: string }>(f, token, "GET", `/accounts/${account}/workers/subdomain`).catch(() => ({ subdomain: undefined }));
      return { url: sub.subdomain ? `https://${name}.${sub.subdomain}.workers.dev` : null, versionId: put.deployment_id ?? put.etag ?? null };
    },
  };
}
