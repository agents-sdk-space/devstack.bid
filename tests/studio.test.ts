import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { D1Like } from "@/lib/chat/store";

/**
 * /studio (merged DEVSTACK workspace): server proxy, quotas, headers, brand sync, docs wiring.
 * The Studio's own client tests run with `npm run studio:check` (Vitest inside studio/).
 */

const cf: { env: Record<string, unknown> | null } = { env: null };
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => {
    if (!cf.env) throw new Error("not on Workers");
    return { env: cf.env, ctx: { waitUntil: () => undefined } };
  },
}));

function fakeD1(): D1Like & { rows: Map<string, number> } {
  const rows = new Map<string, number>();
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    async all() {
      const k = `${args[0]}|${args[1]}`;
      if (sql.startsWith("SELECT")) return { results: rows.has(k) ? [{ count: rows.get(k) }] : [] };
      if (sql.startsWith("INSERT")) rows.set(k, (rows.get(k) ?? 0) + 1);
      if (sql.startsWith("UPDATE")) rows.set(k, Math.max((rows.get(k) ?? 0) - 1, 0));
      return { results: [] };
    },
    async run() {
      return this.all();
    },
    async first() {
      return ((await this.all()).results?.[0] ?? null) as never;
    },
  });
  return {
    rows,
    prepare: (sql: string) => stmt(sql) as never,
    batch: async (s: unknown[]) => Promise.all((s as { all(): Promise<unknown> }[]).map((x) => x.all())) as never,
  };
}

const SECRET = "x".repeat(40);
const ORIGIN = "https://devstack.bid";
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.7", ...headers },
    body: JSON.stringify(body),
  });

describe("studio proxy logic", async () => {
  const { validateChatBody, validateImageBody, isSameOrigin, providerChain, studioRules, complete } = await import("@/lib/studio/proxy");
  const { studioEnv } = await import("@/lib/studio/config");
  const env = studioEnv({});

  it("validates chat bodies like the DEVSTACK handler", () => {
    expect(validateChatBody({})).toMatch(/messages/);
    expect(validateChatBody({ messages: [{ role: "tool", content: "x" }] })).toMatch(/role/);
    const ok = validateChatBody({ messages: [{ role: "user", content: "hi\u0000" }], json: true, maxTokens: 99_999 });
    expect(typeof ok).toBe("object");
    if (typeof ok === "object") {
      expect(ok.maxTokens).toBe(8_000);
      expect(ok.messages[0].content).toBe("hi");
      expect(ok.json).toBe(true);
    }
    expect(validateImageBody({ prompt: "  " })).toMatch(/prompt/);
    expect(validateImageBody({ prompt: "cat", size: "9x9" })).toEqual({ prompt: "cat", size: "1024x1024" });
  });

  it("allows same-origin requests only", () => {
    expect(isSameOrigin(post("/api/studio/llm/chat", {}))).toBe(true);
    expect(isSameOrigin(post("/api/studio/llm/chat", {}, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(post("/api/studio/llm/chat", {}, { origin: "https://evil.example", "sec-fetch-site": "" }))).toBe(false);
    expect(isSameOrigin(new Request(`${ORIGIN}/api/studio/llm/chat`, { method: "POST" }))).toBe(false);
    expect(isSameOrigin(new Request(`${ORIGIN}/api/studio/health`))).toBe(true);
  });

  it("orders providers: Workers AI first by default, Hugging Face first with STUDIO_PROVIDER=hf", () => {
    const ai = { run: vi.fn() };
    expect(providerChain({ env, ai, hfToken: "hf_abcdefghijkl", hfModel: "deepseek-ai/DeepSeek-V3" }).map((p) => p.kind)).toEqual(["wai", "hf"]);
    expect(providerChain({ env: studioEnv({ STUDIO_PROVIDER: "hf" }), ai, hfToken: "hf_abcdefghijkl", hfModel: "m" }).map((p) => p.kind)).toEqual(["hf", "wai"]);
    expect(providerChain({ env, ai: null, hfToken: undefined, hfModel: "m" })).toEqual([]);
  });

  it("counts studio calls per cookie, per IP (x multiplier) and site-wide", () => {
    const rules = studioRules("1.2.3.4", "uid-1", env, { ipMultiplier: 3 });
    expect(rules.map((r) => [r.kind, r.limit])).toEqual([
      ["studio_user_day", 60],
      ["studio_ip_day", 180],
      ["studio_global_day", 3000],
    ]);
  });

  it("completes through Workers AI, adds a JSON instruction, and caps max tokens", async () => {
    const run = vi.fn().mockResolvedValue({ response: '{"ok":true}' });
    const out = await complete({ env: studioEnv({ STUDIO_MAX_TOKENS: "1000" }), ai: { run }, hfModel: "m" }, { messages: [{ role: "system", content: "S" }, { role: "user", content: "U" }], json: true, maxTokens: 5000 });
    expect(out).toEqual({ content: '{"ok":true}', model: "@cf/qwen/qwen2.5-coder-32b-instruct", provider: "wai" });
    const [model, input] = run.mock.calls[0];
    expect(model).toBe("@cf/qwen/qwen2.5-coder-32b-instruct");
    expect(input.max_tokens).toBe(1000);
    expect(input.messages[0].content).toMatch(/^S[\s\S]*only one valid JSON object/);
  });

  it("falls back to Hugging Face when Workers AI fails, and never leaks the token", async () => {
    const token = "hf_secretsecretsecret";
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: "from hf" } }] })}\n\ndata: [DONE]\n\n`;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(sse, { status: 200 }));
    const out = await complete({ env, ai: { run: vi.fn().mockRejectedValue(new Error("neurons exhausted")) }, hfToken: token, hfModel: "deepseek-ai/DeepSeek-V3" }, { messages: [{ role: "user", content: "x" }] });
    expect(out.provider).toBe("hf");
    expect(out.content).toBe("from hf");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: `bad ${token}` }), { status: 401 }));
    await expect(complete({ env, ai: null, hfToken: token, hfModel: "m" }, { messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/All providers failed/);
    try {
      await complete({ env, ai: null, hfToken: token, hfModel: "m" }, { messages: [{ role: "user", content: "x" }] });
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(token);
    }
    fetchMock.mockRestore();
  });
});

describe("studio API routes", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.CHAT_COOKIE_SECRET = SECRET;
    process.env.HF_TOKEN = "";
    cf.env = null;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("health without Workers bindings: offline (mock agents), no secrets", async () => {
    const { handleStudioHealth } = await import("@/lib/studio/route");
    const res = await handleStudioHealth(new Request(`${ORIGIN}/api/studio/health`));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, llm: false, image: false, quota: null });
    expect(body.note).toMatch(/offline/);
    expect(JSON.stringify(body)).not.toMatch(/secret|token|key/i);
  });

  it("health with D1 + AI: Workers AI, quota, identity cookie", async () => {
    cf.env = { DB: fakeD1(), AI: { run: vi.fn() } };
    const { handleStudioHealth } = await import("@/lib/studio/route");
    const res = await handleStudioHealth(new Request(`${ORIGIN}/api/studio/health`));
    const body = await res.json();
    expect(body).toMatchObject({ llm: true, image: true, provider: "Workers AI", model: "@cf/qwen/qwen2.5-coder-32b-instruct", quota: { callsLeft: 60, imagesLeft: 5 } });
    expect(res.headers.get("set-cookie")).toMatch(/^nvx_chat_uid=/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("chat: rejects cross-origin, then answers and counts quota", async () => {
    const db = fakeD1();
    cf.env = { DB: db, AI: { run: vi.fn().mockResolvedValue({ response: "hello" }) }, NVX_STUDIO_LIMITER: { limit: async () => ({ success: true }) } };
    const { handleStudioChat } = await import("@/lib/studio/route");
    const msg = { messages: [{ role: "user", content: "build a todo app" }] };
    expect((await handleStudioChat(post("/api/studio/llm/chat", msg, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).status).toBe(403);
    const res = await handleStudioChat(post("/api/studio/llm/chat", msg));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: "hello", model: "@cf/qwen/qwen2.5-coder-32b-instruct" });
    expect([...db.rows.entries()].filter(([k]) => k.startsWith("studio:")).map(([, v]) => v)).toEqual([1, 1, 1]);
  });

  it("chat: refunds the quota when every provider fails, and returns 429 when the day is used up", async () => {
    const db = fakeD1();
    cf.env = { DB: db, AI: { run: vi.fn().mockRejectedValue(new Error("down")) } };
    const { handleStudioChat } = await import("@/lib/studio/route");
    const res = await handleStudioChat(post("/api/studio/llm/chat", { messages: [{ role: "user", content: "x" }] }));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("provider_failed");
    expect([...db.rows.entries()].filter(([k]) => k.startsWith("studio:")).every(([, v]) => v === 0)).toBe(true);

    process.env.STUDIO_DAILY_CALLS = "0";
    const limited = await handleStudioChat(post("/api/studio/llm/chat", { messages: [{ role: "user", content: "x" }] }));
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toMatch(/Studio/);
  });

  it("chat/image: 503 without D1 (the Studio then uses its mock agents)", async () => {
    const { handleStudioChat, handleStudioImage } = await import("@/lib/studio/route");
    expect((await handleStudioChat(post("/api/studio/llm/chat", { messages: [{ role: "user", content: "x" }] }))).status).toBe(503);
    expect((await handleStudioImage(post("/api/studio/image", { prompt: "cat" }))).status).toBe(503);
  });

  it("image: FLUX bytes become a data URL and use the shared free-image quota", async () => {
    const db = fakeD1();
    const jpeg = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0));
    cf.env = { DB: db, AI: { run: vi.fn().mockResolvedValue({ image: jpeg }) } };
    const { handleStudioImage } = await import("@/lib/studio/route");
    const res = await handleStudioImage(post("/api/studio/image", { prompt: "todo hero" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dataUrl).toBe(`data:image/jpeg;base64,${jpeg}`);
    expect([...db.rows.keys()].some((k) => k.startsWith("image:uid:"))).toBe(true);
  });
});

describe("studio headers, assets and brand", async () => {
  const { securityHeaders, studioContentSecurityPolicy, STUDIO_ISOLATION_HEADERS } = await import("@/lib/security-headers");
  const headersFile = readFileSync(join(process.cwd(), "public/_headers"), "utf8");
  const block = (pattern: string) => {
    const lines = headersFile.split("\n");
    const i = lines.indexOf(pattern);
    if (i < 0) return "";
    const out: string[] = [];
    for (const l of lines.slice(i + 1)) {
      if (!l.startsWith("  ")) break;
      out.push(l.trim());
    }
    return out.join("\n");
  };

  it("public/_headers scopes COOP/COEP + the Studio CSP to /studio/*", () => {
    const studio = block("/studio/*");
    for (const [k, v] of Object.entries(STUDIO_ISOLATION_HEADERS)) expect(studio).toContain(`${k}: ${v}`);
    expect(studio).toContain(`Content-Security-Policy: ${studioContentSecurityPolicy()}`);
    expect(block("/*")).not.toMatch(/Cross-Origin-Embedder-Policy|Content-Security-Policy/);
  });

  it("the rest of the site gets no COEP (embeds, analytics and images keep working)", () => {
    expect(securityHeaders().map((h) => h.key)).not.toContain("Cross-Origin-Embedder-Policy");
    const csp = studioContentSecurityPolicy();
    expect(csp).not.toMatch(/'unsafe-eval'|script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("'wasm-unsafe-eval'");
  });

  it("brand copies in studio/src/brand match the Next.js sources", async () => {
    const { staleFiles } = await import("../scripts/sync-studio-brand.mjs");
    expect(staleFiles()).toEqual([]);
  });

  it("studio/src has no emoji icons and no secrets", () => {
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2705}\u{2714}\u{2716}\u{274C}\u{2728}]/u;
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(p) ? [p] : [];
      });
    const files = walk(join(process.cwd(), "studio/src"));
    expect(files.length).toBeGreaterThan(40);
    expect(files.filter((p) => EMOJI.test(readFileSync(p, "utf8")))).toEqual([]);
    expect(files.filter((p) => /LLM_API_KEY|VITE_[A-Z_]*KEY|import\.meta\.env\.[A-Z_]*KEY/.test(readFileSync(p, "utf8")))).toEqual([]);
  });

  it("the Studio calls only /api/studio/* and the header links to it as a document", () => {
    const paths = readFileSync(join(process.cwd(), "studio/src/shared/apiPaths.ts"), "utf8");
    expect(paths).toContain("'/api/studio/health'");
    expect(paths).toContain("'/api/studio/llm/chat'");
    expect(paths).toContain("'/api/studio/image'");
    const header = readFileSync(join(process.cwd(), "src/components/header.tsx"), "utf8");
    expect(header).toMatch(/href: "\/studio\/", key: "nav.studio", Icon: AppWindow, wide: true, document: true/);
    const vite = readFileSync(join(process.cwd(), "studio/vite.config.ts"), "utf8");
    expect(vite).toContain("base: '/studio/'");
  });
});
