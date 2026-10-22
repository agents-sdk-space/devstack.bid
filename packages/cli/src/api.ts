/** Thin fetch wrapper. Errors carry the server's real message/code; the token is never included in output. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body?: unknown) { super(message); }
}

export type Fetch = typeof fetch;

export class Api {
  constructor(public base: string, private token: string | null, private f: Fetch = fetch) {}

  async req<T = Record<string, unknown>>(method: string, path: string, body?: unknown, opts: { raw?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = { "User-Agent": "devstack-cli/0.1.1", Accept: "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let res: Response;
    try {
      res = await this.f(`${this.base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "error" });
    } catch (e) {
      throw new ApiError(0, "network", `Could not reach ${this.base} (${(e as Error).message})`);
    }
    if (opts.raw && res.ok) return res as unknown as T;
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const d = (data ?? {}) as { error?: string; code?: string };
      throw new ApiError(res.status, d.code ?? `http_${res.status}`, d.error ?? `HTTP ${res.status} ${res.statusText}`.trim(), data);
    }
    return (data ?? {}) as T;
  }
}

/** Redacts anything token-shaped from text before printing. */
export function redact(s: string): string {
  return s.replace(/nvx_live_[A-Za-z0-9_-]+/g, "nvx_live_***").replace(/dvc_[A-Za-z0-9_-]+/g, "dvc_***").replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "***");
}
