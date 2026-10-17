import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Server-side event reporting to stack-hub (the private hub Worker in this Cloudflare account).
 *
 * - Prefers the HUB service binding (same account; never leaves Cloudflare, not subject to Access),
 *   falls back to HUB_URL over HTTPS. Both authenticate with the HUB_API_KEY secret.
 * - Always scheduled with ctx.waitUntil after the response is ready, 3 s timeout, every error
 *   swallowed: a slow or down hub never delays or breaks chat or sign-in.
 * - Payloads are small and PII-free (no message text, emails, IPs, cookies or GitHub logins).
 * Off unless HUB_API_KEY and (HUB or HUB_URL) are configured.
 */
export type HubPayload = Record<string, string | number | boolean | null | undefined>;
interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}
export interface HubConfig {
  binding?: Fetcher;
  url?: string;
  key?: string;
}

export const HUB_SITE = "devstack.bid";
export const HUB_TIMEOUT_MS = 3000;
const BINDING_ORIGIN = "https://stack-hub.internal";

export async function sendHubEvent(cfg: HubConfig, type: string, payload: HubPayload, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!cfg.key || (!cfg.binding && !cfg.url)) return false;
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
  const base = cfg.binding ? BINDING_ORIGIN : cfg.url!.replace(/\/$/, "");
  const init: RequestInit = {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/json", "user-agent": "devstack.bid-hub-reporter/1" },
    body: JSON.stringify({ site: HUB_SITE, type, payload: clean }),
    signal: AbortSignal.timeout(HUB_TIMEOUT_MS),
  };
  try {
    const res = cfg.binding ? await cfg.binding.fetch(new Request(`${base}/api/v1/events`, init)) : await fetcher(`${base}/api/v1/events`, init);
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

/** Fire-and-forget from a route handler. Never throws, never awaits the network. */
export function reportHubEvent(type: string, payload: HubPayload): void {
  void (async () => {
    try {
      const { env, ctx } = await getCloudflareContext({ async: true });
      const e = env as unknown as { HUB?: Fetcher; HUB_URL?: string; HUB_API_KEY?: string };
      const key = typeof e.HUB_API_KEY === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(e.HUB_API_KEY.trim()) ? e.HUB_API_KEY.trim() : undefined;
      if (!key) return;
      ctx.waitUntil(sendHubEvent({ binding: e.HUB, url: e.HUB_URL, key }, type, payload));
    } catch {
      /* no Cloudflare context (tests, next dev): reporting off */
    }
  })();
}

/** oauthFail() redirects to /login?auth=missing|error|denied; anything else with a session cookie is a success. */
export function loginOutcome(res: Response): { outcome: "ok" | "failed"; reason: string | null } {
  try {
    const loc = new URL(res.headers.get("location") ?? "", "https://devstack.bid");
    const reason = loc.pathname === "/login" ? loc.searchParams.get("auth") : null;
    if (reason) return { outcome: "failed", reason: /^(missing|error|denied)$/.test(reason) ? reason : "error" };
    return { outcome: "ok", reason: null };
  } catch {
    return { outcome: "failed", reason: "error" };
  }
}
