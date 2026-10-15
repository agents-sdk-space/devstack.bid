import "server-only";

/**
 * Cloudflare Turnstile server-side Siteverify for the password sign-in / sign-up form.
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * - Off when TURNSTILE_SECRET_KEY is unset (local dev without keys): the form keeps working.
 * - When on, requires success, the expected action and an allowed hostname (TURNSTILE_HOSTNAMES).
 * - Uses an idempotency_key so a retried call after a network error is not treated as a replay.
 * - Cloudflare's documented test secrets (1x…/2x…/3x…) return a dummy hostname/action, so those
 *   two checks are skipped only for test secrets; a real secret always gets the full check.
 */

export const TURNSTILE_ACTION = "password_auth";
export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TEST_SECRET = /^[123]x0{30,}A{2}$/;

export type TurnstileResult = { ok: true; skipped?: boolean } | { ok: false; reason: string };

export function isTestSecret(secret: string): boolean {
  return TEST_SECRET.test(secret);
}

export function turnstileConfig(source: Record<string, string | undefined> = process.env) {
  const secret = source.TURNSTILE_SECRET_KEY?.trim() || "";
  const siteKey = source.TURNSTILE_SITE_KEY?.trim() || "";
  const hostnames = (source.TURNSTILE_HOSTNAMES ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return { secret, siteKey, hostnames, enabled: secret.length > 0 };
}

/** Public site key for the widget, or "" when Turnstile is off (no secret configured). */
export function turnstileSiteKey(source: Record<string, string | undefined> = process.env): string {
  const c = turnstileConfig(source);
  return c.enabled ? c.siteKey : "";
}

export async function verifyTurnstile(
  token: unknown,
  remoteIp: string | null,
  opts: { source?: Record<string, string | undefined>; fetchImpl?: typeof fetch; idempotencyKey?: string } = {}
): Promise<TurnstileResult> {
  const cfg = turnstileConfig(opts.source);
  if (!cfg.enabled) return { ok: true, skipped: true };
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return { ok: false, reason: "missing-token" };
  const test = isTestSecret(cfg.secret);
  if (!test && cfg.hostnames.length === 0) return { ok: false, reason: "no-hostnames" };
  const doFetch = opts.fetchImpl ?? fetch;
  const idem = opts.idempotencyKey ?? crypto.randomUUID();
  const body = new URLSearchParams({ secret: cfg.secret, response: token, idempotency_key: idem });
  if (remoteIp) body.set("remoteip", remoteIp);
  let data: { success?: boolean; action?: string; hostname?: string; "error-codes"?: string[] } | null = null;
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    try {
      const r = await doFetch(SITEVERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(8_000),
      });
      if (r.ok) data = await r.json();
      else if (r.status < 500) return { ok: false, reason: `http-${r.status}` };
    } catch {
      // network error or timeout: retry once with the same idempotency key
    }
  }
  if (!data) return { ok: false, reason: "unavailable" };
  if (data.success !== true) return { ok: false, reason: (data["error-codes"] ?? ["failed"]).join(",") };
  if (!test) {
    if (data.action !== TURNSTILE_ACTION) return { ok: false, reason: "action-mismatch" };
    if (!data.hostname || !cfg.hostnames.includes(data.hostname.toLowerCase())) return { ok: false, reason: "hostname-mismatch" };
  }
  return { ok: true };
}
