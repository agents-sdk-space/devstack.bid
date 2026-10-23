/**
 * Custom domains for user sites via Cloudflare for SaaS (custom hostnames on the platform zone).
 * The user adds a CNAME <hostname> -> <cnameTarget> (plus any TXT records Cloudflare asks for);
 * Cloudflare validates ownership + issues the certificate; the sites router maps Host -> site label
 * through R2 domains/<hostname>.json (written only when the hostname is active).
 */
import { PLATFORM_DOMAIN, RESERVED_SUBSTRINGS } from "./hostnames";
import type { R2BucketLike } from "./serve";

export interface SaasApi { zoneId: string; token: string; cnameTarget: string; fetcher?: typeof fetch }

export type DnsRecord = { type: "CNAME" | "TXT"; name: string; value: string; purpose: "routing" | "ownership" | "certificate" };
export interface HostnameState { id: string; hostname: string; status: string; sslStatus: string | null; records: DnsRecord[]; errors: string[] }

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Normalise and validate a user hostname. Rejects the platform domain, IPs, single labels and look-alikes. */
export function normalizeHostname(input: string): string | null {
  const h = String(input ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!h || h.length > 253 || h.includes(":")) return null;
  const labels = h.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  if (/^\d+$/.test(labels[labels.length - 1])) return null;
  if (h === PLATFORM_DOMAIN || h.endsWith(`.${PLATFORM_DOMAIN}`)) return null;
  if (h.endsWith(".workers.dev") || h.endsWith(".pages.dev")) return null;
  if (labels.slice(0, -1).some((l) => RESERVED_SUBSTRINGS.some((r) => l.includes(r)))) return null;
  return h;
}

export class SaasError extends Error {
  constructor(public status: number, public cfCode: number | null) { super(`cf_saas_${status}${cfCode ? `_${cfCode}` : ""}`); }
}

async function call<T>(api: SaasApi, path: string, init: RequestInit = {}): Promise<T> {
  const f = api.fetcher ?? fetch;
  const res = await f(`https://api.cloudflare.com/client/v4/zones/${api.zoneId}/custom_hostnames${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${api.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { code?: number }[] } | null;
  if (!res.ok || !body?.success) throw new SaasError(res.status, typeof body?.errors?.[0]?.code === "number" ? body.errors[0].code! : null);
  return body.result as T;
}

type CfHostname = {
  id: string; hostname: string; status?: string;
  ownership_verification?: { type?: string; name?: string; value?: string };
  ssl?: { status?: string; validation_records?: { txt_name?: string; txt_value?: string }[]; validation_errors?: { message?: string }[] };
  verification_errors?: string[];
};

export function toState(api: Pick<SaasApi, "cnameTarget">, r: CfHostname): HostnameState {
  const records: DnsRecord[] = [{ type: "CNAME", name: r.hostname, value: api.cnameTarget, purpose: "routing" }];
  const ov = r.ownership_verification;
  if (r.status !== "active" && ov?.type === "txt" && ov.name && ov.value) records.push({ type: "TXT", name: ov.name, value: ov.value, purpose: "ownership" });
  if (r.ssl?.status !== "active") for (const v of r.ssl?.validation_records ?? []) if (v.txt_name && v.txt_value) records.push({ type: "TXT", name: v.txt_name, value: v.txt_value, purpose: "certificate" });
  const errors = [...(r.verification_errors ?? []), ...(r.ssl?.validation_errors ?? []).map((e) => String(e.message ?? ""))].filter(Boolean).map((e) => e.slice(0, 200));
  return { id: r.id, hostname: r.hostname, status: r.status ?? "pending", sslStatus: r.ssl?.status ?? null, records, errors };
}

export async function createHostname(api: SaasApi, hostname: string): Promise<HostnameState> {
  const r = await call<CfHostname>(api, "", { method: "POST", body: JSON.stringify({ hostname, ssl: { method: "txt", type: "dv", settings: { min_tls_version: "1.2" } } }) });
  return toState(api, r);
}

export async function getHostname(api: SaasApi, id: string): Promise<HostnameState> {
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) throw new SaasError(400, null);
  return toState(api, await call<CfHostname>(api, `/${id}`));
}

export async function deleteHostname(api: SaasApi, id: string): Promise<void> {
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) return;
  try { await call(api, `/${id}`, { method: "DELETE" }); } catch (e) { if (!(e instanceof SaasError && e.status === 404)) throw e; }
}

export const isLive = (s: Pick<HostnameState, "status" | "sslStatus">) => s.status === "active" && s.sslStatus === "active";

/** Router mapping (R2). Only written for live hostnames. */
export const domainKey = (hostname: string) => `domains/${hostname}.json`;
export async function writeDomainMapping(bucket: R2BucketLike, hostname: string, label: string): Promise<void> {
  await bucket.put(domainKey(hostname), JSON.stringify({ label }), { httpMetadata: { contentType: "application/json" } });
}
export async function removeDomainMapping(bucket: R2BucketLike, hostname: string): Promise<void> {
  await bucket.delete?.(domainKey(hostname));
}

/** Resolve a custom Host header to a site label, or null. */
export async function resolveCustomDomain(bucket: R2BucketLike, host: string): Promise<string | null> {
  const h = normalizeHostname(host.replace(/:\d+$/, ""));
  if (!h) return null;
  const o = await bucket.get(domainKey(h));
  if (!o) return null;
  const text = o.text ? await o.text() : await new Response(o.body).text();
  try {
    const label = (JSON.parse(text) as { label?: unknown }).label;
    return typeof label === "string" && LABEL.test(label) ? label : null;
  } catch { return null; }
}

/** Config from Worker env; null when the platform has not enabled custom hostnames yet. */
export function saasFromEnv(env: Record<string, unknown>): SaasApi | null {
  const zoneId = env.SITES_ZONE_ID, token = env.SITES_SAAS_API_TOKEN, cnameTarget = env.SITES_CNAME_TARGET;
  if (typeof zoneId !== "string" || !/^[a-f0-9]{32}$/.test(zoneId)) return null;
  if (typeof token !== "string" || token.length < 20) return null;
  if (typeof cnameTarget !== "string" || !cnameTarget.endsWith(`.${PLATFORM_DOMAIN}`)) return null;
  return { zoneId, token, cnameTarget };
}
