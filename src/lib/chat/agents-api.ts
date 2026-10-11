/**
 * Minimal OpenAI Agents API client for Workers (fetch + SSE), server-side only. The API key
 * never leaves the Worker; errors are redacted before they are logged or shown.
 * Docs: https://developers.openai.com/api/docs/guides/agents-api/overview
 */

export class AgentsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "AgentsApiError";
  }
}

// Raw API events are loosely typed on purpose: we read a few fields defensively.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawEvent = Record<string, any> & { type: string };

export function redact(text: string, ...secrets: (string | undefined)[]): string {
  let out = text.replace(/sk-[A-Za-z0-9_-]{10,}/g, "[redacted]");
  for (const s of secrets) if (s && s.length > 8) out = out.split(s).join("[redacted]");
  return out;
}

export class AgentsApi {
  constructor(
    private apiKey: string,
    private base = "https://api.openai.com/v1",
    private fetchImpl: typeof fetch = (...a) => fetch(...a)
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.apiKey}`, "OpenAI-Beta": "agents=v1", "Content-Type": "application/json", ...extra };
  }

  private async check(res: Response): Promise<Response> {
    if (res.ok) return res;
    let message = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } };
      message = body.error?.message ?? message;
      code = body.error?.code;
    } catch {
      /* not JSON */
    }
    throw new AgentsApiError(redact(message, this.apiKey).slice(0, 300), res.status, code);
  }

  /** POST /agents/sessions with stream: true; the response body is the session's SSE stream. */
  async createSessionStream(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    const res = await this.fetchImpl(`${this.base}/agents/sessions`, {
      method: "POST",
      headers: this.headers({ Accept: "text/event-stream" }),
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
    return this.check(res);
  }

  async openEvents(sessionId: string, signal?: AbortSignal): Promise<Response> {
    const res = await this.fetchImpl(`${this.base}/agents/sessions/${encodeURIComponent(sessionId)}/events?stream=true`, {
      headers: this.headers({ Accept: "text/event-stream" }),
      signal,
    });
    return this.check(res);
  }

  async sendEvents(sessionId: string, events: Record<string, unknown>[]): Promise<void> {
    const res = await this.fetchImpl(`${this.base}/agents/sessions/${encodeURIComponent(sessionId)}/events`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ events }),
    });
    await this.check(res);
  }

  /** POST /agents — create a saved agent (Sandbox Factory, in the caller's own account). */
  async createAgent(body: Record<string, unknown>): Promise<{ id: string; name?: string; model?: string }> {
    const res = await this.check(await this.fetchImpl(`${this.base}/agents`, { method: "POST", headers: this.headers({ "Content-Type": "application/json" }), body: JSON.stringify(body) }));
    return res.json();
  }

  /** POST /agents/sessions without streaming (Sandbox Factory: session first, input later). */
  async createSession(body: Record<string, unknown>): Promise<{ id: string; status?: string; environment?: { id?: string; type?: string; remote_url?: string; workspace_directory?: string } }> {
    const res = await this.check(
      await this.fetchImpl(`${this.base}/agents/sessions`, { method: "POST", headers: this.headers({ "Content-Type": "application/json" }), body: JSON.stringify({ ...body, stream: false }) })
    );
    return res.json();
  }

  async retrieveTurn(sessionId: string, turnId: string): Promise<{ status: string; usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } } | null }> {
    const res = await this.check(
      await this.fetchImpl(`${this.base}/agents/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`, { headers: this.headers() })
    );
    return res.json();
  }

  async listArtifacts(sessionId: string): Promise<{ id: string; path: string; size_bytes: number; turn_id: string }[]> {
    const res = await this.check(await this.fetchImpl(`${this.base}/agents/sessions/${encodeURIComponent(sessionId)}/artifacts?limit=50`, { headers: this.headers() }));
    const body = (await res.json()) as { data?: { id: string; path: string; size_bytes: number; turn_id: string }[] };
    return body.data ?? [];
  }

  async artifactContent(sessionId: string, artifactId: string): Promise<Response> {
    return this.check(
      await this.fetchImpl(`${this.base}/agents/sessions/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(artifactId)}/content`, {
        headers: this.headers(),
      })
    );
  }

  /** Images API (used by the generate_image function tool). Returns raw bytes. */
  async generateImage(p: { model: string; prompt: string; size: string; quality: string }): Promise<{ bytes: Uint8Array; mime: string; usage?: unknown }> {
    const res = await this.check(
      await this.fetchImpl(`${this.base}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, n: 1, output_format: "webp", output_compression: 80 }),
      })
    );
    const body = (await res.json()) as { data?: { b64_json?: string }[]; usage?: unknown };
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new AgentsApiError("image API returned no data", 502);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime: "image/webp", usage: body.usage };
  }
}

/** Parse a text/event-stream body into JSON events (ignores comments and non-JSON data). */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<RawEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + (buf[idx] === "\r" ? 4 : 2));
        const data = block
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev && typeof ev.type === "string") yield ev as RawEvent;
        } catch {
          /* skip malformed block */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
