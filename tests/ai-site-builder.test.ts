import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { applyEdits, editContext, safePath, validateSnapshot, MAX_FILES } from "@/lib/aisite/files";
import { openaiBase, parseModelEdit, generateEdit, titleFor } from "@/lib/aisite/llm";
import { kvRateLimit } from "@/lib/aisite/kv-limit";
import { exportToGithub } from "@/lib/aisite/export";
import { safePreviewUrl } from "@/components/aisite/ai-site-builder";

const idx = { path: "index.html", content: "<h1>Hi</h1>" };

describe("ai site files", () => {
  it("rejects traversal, hidden, absolute and disallowed paths", () => {
    for (const p of ["../x.html", "/a.html", "a/../b.html", ".env", "a\\b.html", "x.php", "a/%2e%2e/b.html", "noext", "a/.git/config.txt"]) expect(safePath(p)).toBeNull();
    expect(safePath("./css/site.css")).toBe("css/site.css");
  });
  it("requires index.html and enforces caps", () => {
    expect(() => validateSnapshot([{ path: "a.css", content: "" }])).toThrow(/index.html/);
    expect(() => validateSnapshot([idx, { path: "big.js", content: "x".repeat(300 * 1024) }])).toThrow(/too large/);
    expect(() => validateSnapshot(Array.from({ length: MAX_FILES + 1 }, (_, i) => ({ path: i ? `f${i}.css` : "index.html", content: "" })))).toThrow(/Too many/);
    expect(() => validateSnapshot([idx, { path: "INDEX.html", content: "" }])).toThrow(/Duplicate/);
  });
  it("applies write/replace/delete edits and refuses ambiguous ones", () => {
    const cur = [idx, { path: "a.css", content: "body{color:red}" }];
    const next = applyEdits(cur, { replace: [{ path: "a.css", find: "red", with: "blue" }], write: [{ path: "b.js", content: "1" }] });
    expect(next.find((f) => f.path === "a.css")!.content).toBe("body{color:blue}");
    expect(applyEdits(next, { delete: ["b.js"] }).map((f) => f.path)).toEqual(["a.css", "index.html"]);
    expect(() => applyEdits(cur, { replace: [{ path: "a.css", find: "zzz", with: "" }] })).toThrow(/exactly once/);
    expect(() => applyEdits(cur, { delete: ["missing.css"] })).toThrow();
    expect(() => applyEdits(cur, { write: [{ path: "../evil.html", content: "" }] })).toThrow(/Invalid/);
  });
  it("builds edit context with the file tree", () => {
    const c = editContext([idx, { path: "big.js", content: "y".repeat(100) }], 50);
    expect(c).toContain("- big.js (100 bytes)");
    expect(c).toContain("<<<FILE index.html");
    expect(c).not.toContain("<<<FILE big.js");
  });
});

describe("ai site llm", () => {
  it("routes through Cloudflare AI Gateway only when configured", () => {
    expect(openaiBase({ accountId: "a".repeat(32), gatewayId: "devstack" })).toEqual({ url: `https://gateway.ai.cloudflare.com/v1/${"a".repeat(32)}/devstack/openai`, via: "cf-ai-gateway" });
    expect(openaiBase({}).via).toBe("direct");
    expect(openaiBase({ accountId: "../x", gatewayId: "g" }).via).toBe("direct");
  });
  it("parses and sanitises model output", () => {
    const e = parseModelEdit('```json\n{"summary":"<b>Done</b>","write":[{"path":"index.html","content":"x"}]}\n```');
    expect(e.summary).toBe("Done");
    expect(() => parseModelEdit("nope")).toThrow(/invalid JSON/);
    expect(() => parseModelEdit('{"summary":"x"}')).toThrow(/no file changes/);
  });
  it("is Blocked without a key, logs the direct fallback, never leaks the key", async () => {
    await expect(generateEdit({ apiKey: undefined, model: "m", maxTokens: 10, timeoutMs: 1000 }, { lang: "en", prompt: "x", context: null, history: [] })).rejects.toMatchObject({ code: "blocked" });
    const logs: string[] = [];
    const key = "sk-test-" + "k".repeat(30);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: `bad key ${key}` } }), { status: 401 }));
    const err = await generateEdit({ apiKey: key, model: "m", maxTokens: 10, timeoutMs: 1000 }, { lang: "en", prompt: "x", context: null, history: [] }, (m) => logs.push(m), fetcher as unknown as typeof fetch).catch((e) => e);
    expect(String(err.message)).not.toContain(key);
    expect(logs.join()).toMatch(/AI Gateway not configured/);
    expect(logs.join()).not.toContain(key);
    expect((fetcher.mock.calls[0] as unknown[])[0]).toBe("https://api.openai.com/v1/chat/completions");
  });
  it("titles via Workers AI with a deterministic fallback", async () => {
    expect((await titleFor("coffee shop with menu and map", null, "@cf/x")).title).toBe("coffee shop with menu and");
    const ai = { run: vi.fn<(...a: unknown[]) => Promise<{ response: string }>>(async () => ({ response: "Bean House!" })) };
    expect(await titleFor("x", ai, "@cf/x", "gw")).toEqual({ title: "Bean House", via: "workers-ai" });
    expect(ai.run.mock.calls[0][2]).toEqual({ gateway: { id: "gw", skipCache: true } });
    // gemma-4: thinking off + enough tokens, otherwise the title comes back empty.
    expect(ai.run.mock.calls[0][1]).toMatchObject({ max_tokens: 24, chat_template_kwargs: { enable_thinking: false } });
  });
});

describe("kv rate limit", () => {
  it("counts per window in KV", async () => {
    const m = new Map<string, string>();
    const kv = { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) };
    const now = 1_000_000_000;
    expect(await kvRateLimit(kv, "u", 2, 60, now)).toBe(true);
    expect(await kvRateLimit(kv, "u", 2, 60, now)).toBe(true);
    expect(await kvRateLimit(kv, "u", 2, 60, now)).toBe(false);
    expect(await kvRateLimit(kv, "u", 2, 60, now + 61_000)).toBe(true);
  });
});

describe("export + preview safety", () => {
  it("writes every file with putFile and validates the repo", async () => {
    const put = vi.fn(async () => ({ url: "u", commit: "c1" }));
    const r = await exportToGithub("t", { repo: "me/site" }, [idx], 3, put);
    expect(r).toMatchObject({ repo: "me/site", branch: "main", files: 1, lastCommit: "c1" });
    await expect(exportToGithub("t", { repo: "bad" }, [idx], 1, put)).rejects.toThrow(/owner\/name/);
  });
  it("frames only *.devstack.bid site origins, never the apex", () => {
    expect(safePreviewUrl("https://cafe-abc123.devstack.bid/")).toBe("https://cafe-abc123.devstack.bid/");
    for (const u of ["https://devstack.bid/", "https://www.devstack.bid/", "http://x.devstack.bid/", "https://evil.com/", "https://a.b.devstack.bid/", "javascript:alert(1)"]) expect(safePreviewUrl(u)).toBeNull();
  });
});
