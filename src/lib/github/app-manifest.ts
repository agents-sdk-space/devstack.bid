/**
 * GitHub App manifest flow (https://docs.github.com/apps/sharing-github-apps/registering-a-github-app-from-a-manifest).
 * 1. An admin opens /api/github/app/manifest → an auto-submitting form posts the manifest to GitHub with a
 *    signed, expiring `state` bound to their user id.
 * 2. GitHub redirects to /api/github/app/manifest-callback?code&state → we verify state, convert the code
 *    (one use, 1 h) and store the credentials sealed in D1 (`github_app`, single row).
 * Credentials are never logged, returned to the browser or stored in plaintext.
 */
import type { D1Like } from "@/lib/chat/store";
import { open, seal, type SealKeys } from "@/lib/connections/credentials";

export const PUBLIC_ORIGIN_DEFAULT = "https://devstack.bid";
export const DEFAULT_ORG = "agents-sdk-space";
export const STATE_TTL_MS = 10 * 60_000;

export function publicOrigin(env: Record<string, string | undefined> = process.env): string {
  const o = env.PUBLIC_ORIGIN?.trim();
  return o && /^https:\/\/[a-z0-9.-]+$/i.test(o) ? o.replace(/\/$/, "") : PUBLIC_ORIGIN_DEFAULT;
}

export function buildManifest(origin = PUBLIC_ORIGIN_DEFAULT) {
  return {
    name: "DevStack Deploy",
    url: origin,
    description: "Import repositories into DevStack and deploy them automatically on every push.",
    public: true,
    hook_attributes: { url: `${origin}/api/github/webhook`, active: true },
    redirect_url: `${origin}/api/github/app/manifest-callback`,
    setup_url: `${origin}/api/github/app/setup`,
    setup_on_update: true,
    request_oauth_on_install: false,
    default_permissions: { contents: "write", metadata: "read", pull_requests: "read", statuses: "write" },
    default_events: ["push", "pull_request"],
  };
}

/** Where the form posts: an org (`settings/apps/new` under the org) or the signed-in personal account. */
export function manifestTarget(org: string | null, state: string): string {
  const base = org ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new` : "https://github.com/settings/apps/new";
  return `${base}?state=${encodeURIComponent(state)}`;
}

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(`github-app-state:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signState(secret: string, uid: string, now = Date.now()): Promise<string> {
  const nonce = b64u(crypto.getRandomValues(new Uint8Array(12)));
  const body = `${b64u(enc.encode(uid))}.${now + STATE_TTL_MS}.${nonce}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}

export async function verifyState(secret: string, uid: string, state: string | null, now = Date.now()): Promise<boolean> {
  if (!state || state.length > 400) return false;
  const parts = state.split(".");
  if (parts.length !== 4) return false;
  const [u, exp, nonce, sig] = parts;
  if (u !== b64u(enc.encode(uid)) || !(Number(exp) > now) || !nonce) return false;
  let raw: Uint8Array;
  try {
    raw = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  return crypto.subtle.verify("HMAC", await hmacKey(secret), raw as Uint8Array<ArrayBuffer>, enc.encode(`${u}.${exp}.${nonce}`));
}

export interface AppBundle {
  id: number;
  slug: string;
  owner: string;
  html_url: string;
  client_id: string;
  client_secret: string;
  webhook_secret: string;
  pem: string;
}

/** POST /app-manifests/{code}/conversions. Throws on failure without echoing the response body. */
export async function convertManifest(code: string, f: typeof fetch = fetch): Promise<AppBundle> {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(code)) throw new Error("bad_code");
  const res = await f(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: { accept: "application/vnd.github+json", "user-agent": "devstack-bid", "x-github-api-version": "2022-11-28" },
  });
  if (!res.ok) throw new Error(`conversion_failed_${res.status}`);
  const j = (await res.json()) as Record<string, unknown> & { owner?: { login?: string } };
  const s = (k: string) => (typeof j[k] === "string" ? (j[k] as string) : "");
  const b: AppBundle = { id: Number(j.id), slug: s("slug"), owner: j.owner?.login ?? "", html_url: s("html_url"), client_id: s("client_id"), client_secret: s("client_secret"), webhook_secret: s("webhook_secret"), pem: s("pem") };
  if (!Number.isSafeInteger(b.id) || !b.slug || !b.webhook_secret || !b.pem) throw new Error("conversion_incomplete");
  return b;
}

const KIND = "github-app";
const SUBJECT = "owner";

export async function appExists(db: D1Like): Promise<{ app_id: number; slug: string; owner: string; html_url: string } | null> {
  return db.prepare("SELECT app_id, slug, owner, html_url FROM github_app WHERE id = 1").first<{ app_id: number; slug: string; owner: string; html_url: string }>();
}

/** Stores the bundle once. Returns false if an app is already stored (never overwrites). */
export async function storeAppBundle(db: D1Like, keys: SealKeys, b: AppBundle, createdBy: string, now = Date.now()): Promise<boolean> {
  const sealed = await seal(keys, KIND, SUBJECT, JSON.stringify(b));
  const r = await db
    .prepare("INSERT INTO github_app (id, app_id, slug, owner, html_url, sealed, created_by, created_at) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(id) DO NOTHING RETURNING app_id")
    .bind(b.id, b.slug, b.owner, b.html_url, sealed, createdBy, now)
    .first();
  return !!r;
}

export async function loadAppBundle(db: D1Like, keys: SealKeys): Promise<AppBundle | null> {
  const row = await db.prepare("SELECT sealed FROM github_app WHERE id = 1").first<{ sealed: string }>();
  if (!row) return null;
  const opened = await open(keys, KIND, SUBJECT, row.sealed);
  return opened ? (JSON.parse(opened.value) as AppBundle) : null;
}

/**
 * Webhook secret for an App delivery: per-installation env override, then the sealed App secret from the
 * manifest flow, then GITHUB_APP_WEBHOOK_SECRET. Repo webhooks (no installation) use the env secret only.
 */
export async function resolveWebhookSecret(installationId: number | null, env: Record<string, string | undefined>, loadApp: () => Promise<AppBundle | null>): Promise<string | null> {
  if (installationId !== null) {
    const own = env[`GITHUB_APP_WEBHOOK_SECRET_${installationId}`];
    if (own) return own;
    const app = await loadApp().catch(() => null);
    if (app?.webhook_secret) return app.webhook_secret;
  }
  return env.GITHUB_APP_WEBHOOK_SECRET ?? null;
}

export function isAppAdmin(login: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!login) return false;
  const list = `${env.GITHUB_APP_ADMIN_LOGINS ?? ""},${env.AISITE_ADMIN_LOGINS ?? ""}`;
  return list.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(login.toLowerCase());
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
