/**
 * Validate customer keys with the provider BEFORE they are sealed and saved. Pure (fetch injected),
 * no logging. Errors are mapped to codes; provider messages are never echoed (they could quote input).
 */

export type ValidateResult =
  | { ok: true; meta: { account_id?: string; scopes?: string[]; label?: string } }
  | { ok: false; code: "invalid_format" | "rejected" | "account_mismatch" | "provider_unavailable" };

type Fetch = typeof fetch;

export const CF_TOKEN_RE = /^[A-Za-z0-9_-]{40,200}$/;
export const CF_ACCOUNT_RE = /^[a-f0-9]{32}$/;
export const OPENAI_KEY_RE = /^sk-[A-Za-z0-9_-]{20,300}$/;

export async function validateCloudflare(token: string, accountId: string, f: Fetch = fetch): Promise<ValidateResult> {
  if (!CF_TOKEN_RE.test(token) || !CF_ACCOUNT_RE.test(accountId)) return { ok: false, code: "invalid_format" };
  const h = { Authorization: `Bearer ${token}` };
  try {
    const v = await f("https://api.cloudflare.com/client/v4/user/tokens/verify", { headers: h });
    if (v.status === 401 || v.status === 403) return { ok: false, code: "rejected" };
    const vb = (await v.json().catch(() => ({}))) as { success?: boolean; result?: { status?: string } };
    if (!v.ok || !vb.success || vb.result?.status !== "active") return { ok: false, code: v.ok ? "rejected" : "provider_unavailable" };
    const a = await f(`https://api.cloudflare.com/client/v4/accounts/${accountId}`, { headers: h });
    if (a.status === 401 || a.status === 403 || a.status === 404) return { ok: false, code: "account_mismatch" };
    const ab = (await a.json().catch(() => ({}))) as { success?: boolean; result?: { id?: string; name?: string } };
    if (!a.ok || !ab.success || ab.result?.id !== accountId) return { ok: false, code: a.ok ? "account_mismatch" : "provider_unavailable" };
    return { ok: true, meta: { account_id: accountId, label: (ab.result?.name ?? "Cloudflare").slice(0, 80), scopes: ["workers_scripts:edit", "account_settings:read"] } };
  } catch {
    return { ok: false, code: "provider_unavailable" };
  }
}

export async function validateOpenAI(key: string, f: Fetch = fetch): Promise<ValidateResult> {
  if (!OPENAI_KEY_RE.test(key)) return { ok: false, code: "invalid_format" };
  try {
    const r = await f("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    if (r.status === 401 || r.status === 403) return { ok: false, code: "rejected" };
    if (!r.ok) return { ok: false, code: "provider_unavailable" };
    return { ok: true, meta: { label: "OpenAI" } };
  } catch {
    return { ok: false, code: "provider_unavailable" };
  }
}
