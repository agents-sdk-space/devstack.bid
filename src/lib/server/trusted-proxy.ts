import "server-only";
import { serverEnv } from "./env";

/**
 * Requests relayed by our own sites' chat proxies (implemented.stream /api/chat).
 *
 * - x-nvx-site: which site the visitor is on. Only changes the assistant persona (name, which pages
 *   to mention), so it is accepted without a key; unknown values fall back to devstack.bid.
 * - x-nvx-proxy-key + x-nvx-client-ip: implemented.stream lives in another Cloudflare account and
 *   calls devstack.bid over HTTPS, so cf-connecting-ip is that Worker's egress IP. The visitor IP is
 *   trusted for rate limits only when x-nvx-proxy-key matches the CHAT_PROXY_KEY secret.
 */
export type ChatSite = "devstack.bid" | "implemented.stream";

export function chatSite(req: Request): ChatSite {
  return (req.headers.get("x-nvx-site") ?? "").trim().toLowerCase() === "implemented.stream" ? "implemented.stream" : "devstack.bid";
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const IPV4 = /^(\d{1,3})(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:.]{2,45}$/i;

/** The forwarded visitor IP when the request carries the correct proxy key, else null. */
export function trustedClientIp(req: Request, key: string | undefined = safeKey()): string | null {
  const sent = req.headers.get("x-nvx-proxy-key");
  const ip = (req.headers.get("x-nvx-client-ip") ?? "").trim();
  if (!key || !sent || !ip || !constantTimeEqual(sent, key)) return null;
  if (IPV4.test(ip) ? ip.split(".").every((n) => Number(n) <= 255) : IPV6.test(ip) && ip.includes(":")) return ip;
  return null;
}

function safeKey(): string | undefined {
  try {
    return serverEnv().CHAT_PROXY_KEY;
  } catch {
    return undefined;
  }
}
