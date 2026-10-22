/**
 * GitHub App webhook verification (pure; no logging of body or signature).
 * - raw body only, capped at 1 MB
 * - X-Hub-Signature-256 is required and checked with crypto.subtle.verify (constant time)
 * - X-GitHub-Delivery is the idempotency key; X-GitHub-Event must be on the allowlist
 * - the secret is resolved per installation (GitHub App: one secret per app, looked up via
 *   the installation so multiple apps/rotations can coexist)
 */
export const MAX_WEBHOOK_BYTES = 1_000_000;
export const WEBHOOK_EVENTS = new Set(["ping", "push", "pull_request", "installation", "installation_repositories"]);

export type WebhookResult =
  | { ok: true; delivery: string; event: string; installationId: number | null; payload: Record<string, unknown> }
  | { ok: false; status: number; reason: "too_large" | "missing_signature" | "bad_signature" | "missing_delivery" | "event_not_allowed" | "bad_json" | "no_secret" };

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function verifySignature(secret: string, body: Uint8Array, header: string | null): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const sig = hexToBytes(header.slice(7));
  if (!sig) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, sig as Uint8Array<ArrayBuffer>, body as Uint8Array<ArrayBuffer>);
}

/** Read at most `max` bytes of the request body; null if it is larger. */
export async function readCapped(req: Request, max = MAX_WEBHOOK_BYTES): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** Installation id from the payload without trusting anything else before the signature check. */
function peekInstallation(body: Uint8Array): number | null {
  try {
    const id = (JSON.parse(new TextDecoder().decode(body)) as { installation?: { id?: unknown } }).installation?.id;
    return typeof id === "number" && Number.isSafeInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export async function verifyWebhook(req: Request, secretFor: (installationId: number | null) => Promise<string | null>): Promise<WebhookResult> {
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature) return { ok: false, status: 401, reason: "missing_signature" };
  const delivery = req.headers.get("x-github-delivery") ?? "";
  if (!/^[0-9a-f-]{8,64}$/i.test(delivery)) return { ok: false, status: 400, reason: "missing_delivery" };
  const event = req.headers.get("x-github-event") ?? "";
  if (!WEBHOOK_EVENTS.has(event)) return { ok: false, status: 202, reason: "event_not_allowed" };
  const body = await readCapped(req);
  if (!body) return { ok: false, status: 413, reason: "too_large" };
  const installationId = peekInstallation(body);
  const secret = await secretFor(installationId);
  if (!secret) return { ok: false, status: 503, reason: "no_secret" };
  if (!(await verifySignature(secret, body, signature))) return { ok: false, status: 401, reason: "bad_signature" };
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 400, reason: "bad_json" };
  }
  return { ok: true, delivery, event, installationId, payload };
}
