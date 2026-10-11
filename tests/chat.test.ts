import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseMarkdown, safeHref, safeImageSrc } from "@/lib/chat/markdown";
import { agentRules, consume, imageRules, messageRules, quotaStatus, refund, windows, type QuotaConfig } from "@/lib/chat/limits";
import { execServerCommand, factoryAgentBody, factoryEnvironment, shq } from "@/lib/chat/agent-config";
import { readUserKey, REQUIRED_SCOPES, upstreamMessage } from "@/lib/chat/factory";
import { AgentsApiError } from "@/lib/chat/agents-api";
import { cookieHeader, readCookie, signUid, verifyUid } from "@/lib/chat/identity";
import type { D1Like } from "@/lib/chat/store";

vi.mock("@/lib/chat/store", () => ({
  finishMessage: vi.fn().mockResolvedValue(undefined),
  saveInlineImage: vi.fn().mockResolvedValue("img-1"),
}));

/** Minimal in-memory D1 fake covering the usage_counters statements in limits.ts. */
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

const Q: QuotaConfig = {
  messagesPerDay: 20,
  imagesPerDay: 5,
  ipMultiplier: 3,
  chatGlobalDay: 3000,
  imagesGlobalDay: 500,
  agentPerDay: 5,
  agentGlobalDay: 30,
  agentImagesPerDay: 2,
  agentImagesGlobalDay: 20,
};

describe("chat markdown (safe subset)", () => {
  it("parses blocks and inline marks", () => {
    const b = parseMarkdown("# Title\n\nHello **bold** and `code`\n\n- a\n- b\n\n```py\nprint(1)\n```");
    expect(b.map((x) => x.k)).toEqual(["h", "p", "ul", "code"]);
  });
  it("blocks unsafe links and images", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("https://devstack.bid/docs")).toBe("https://devstack.bid/docs");
    expect(safeHref("/docs")).toBe("/docs");
    expect(safeImageSrc("https://evil.example/x.png")).toBeNull();
    expect(safeImageSrc("/api/chat/images/0123")).toBe("/api/chat/images/0123");
  });
});

describe("free-tier quotas", () => {
  it("uses Bangkok-midnight day buckets", () => {
    // 2026-10-11 16:59:59Z = 23:59:59 Bangkok -> still the 11th; 17:00Z = 00:00 on the 12th
    expect(windows(new Date("2026-10-11T16:59:59Z")).day).toBe("d:20261011");
    expect(windows(new Date("2026-10-11T17:00:00Z")).day).toBe("d:20261012");
    expect(windows(new Date("2026-10-11T16:59:59Z")).dayResetSec).toBe(1);
  });

  it("allows 20 messages per cookie, then returns msg_user_day", async () => {
    const db = fakeD1();
    for (let i = 0; i < 20; i++) expect((await consume(db, messageRules("ip1", "u1", Q))).ok).toBe(true);
    const r = await consume(db, messageRules("ip1", "u1", Q));
    expect(r.ok).toBe(false);
    expect(r.exceeded).toBe("msg_user_day");
    // another cookie on the same IP still works until the IP backstop (60)
    expect((await consume(db, messageRules("ip1", "u2", Q))).ok).toBe(true);
  });

  it("enforces the per-IP backstop across cookies", async () => {
    const db = fakeD1();
    for (let i = 0; i < 60; i++) await consume(db, messageRules("ip9", `u${Math.floor(i / 20)}`, Q));
    const r = await consume(db, messageRules("ip9", "fresh", Q));
    expect(r.exceeded).toBe("msg_ip_day");
  });

  it("allows 5 images per day and refunds failed turns", async () => {
    const db = fakeD1();
    for (let i = 0; i < 5; i++) expect((await consume(db, imageRules("ip", "u", Q, "user"))).ok).toBe(true);
    expect((await consume(db, imageRules("ip", "u", Q, "user"))).exceeded).toBe("image_user_day");
    await refund(db, imageRules("ip", "u", Q, "user"));
    expect((await consume(db, imageRules("ip", "u", Q, "user"))).ok).toBe(true);
    // agent images are a separate bucket
    expect((await consume(db, imageRules("ip", "u", Q, "agent"))).ok).toBe(true);
  });

  it("caps Dev Chat agent turns globally", async () => {
    const db = fakeD1();
    for (let i = 0; i < 30; i++) expect((await consume(db, agentRules(`ip${i}`, `u${i}`, Q))).ok).toBe(true);
    expect((await consume(db, agentRules("ipX", "uX", Q))).exceeded).toBe("agent_global_day");
  });

  it("reports remaining quota per channel", async () => {
    const db = fakeD1();
    await consume(db, messageRules("ip", "u", Q));
    await consume(db, imageRules("ip", "u", Q, "user"));
    expect(await quotaStatus(db, "ip", "u", Q, "user")).toMatchObject({ messagesLeft: 19, imagesLeft: 4 });
    expect(await quotaStatus(db, "ip", "u", Q, "dev")).toMatchObject({ agentLeft: 5 });
    expect(await quotaStatus(db, "ip", null, Q, "user")).toMatchObject({ messagesLeft: 20, imagesLeft: 5 });
  });
});

describe("identity cookie", () => {
  it("signs and verifies the uid, rejects tampering", async () => {
    const v = await signUid("01a129a7-e0a2-7f67-b2b6-a2b407d37aea", "secret-secret-secret-secret-1234");
    expect(await verifyUid(v, "secret-secret-secret-secret-1234")).toBe("01a129a7-e0a2-7f67-b2b6-a2b407d37aea");
    expect(await verifyUid(v.replace(/.$/, (c) => (c === "a" ? "b" : "a")), "secret-secret-secret-secret-1234")).toBeNull();
    expect(readCookie(`a=1; nvx_chat_uid=${v}`, "nvx_chat_uid")).toBe(v);
    expect(cookieHeader(v, true)).toMatch(/HttpOnly/);
    expect(cookieHeader(v, true)).toMatch(/Secure/);
  });
});

describe("Sandbox Factory helpers", () => {
  it("reads only a well-formed key from the header", () => {
    const req = (k?: string) => new Request("https://x/api", { headers: k ? { "x-openai-key": k } : {} });
    expect(readUserKey(req("sk-proj-abcdefghijklmnopqrstuvwxyz012345"))).toBe("sk-proj-abcdefghijklmnopqrstuvwxyz012345");
    expect(readUserKey(req("not-a-key"))).toBeNull();
    expect(readUserKey(req())).toBeNull();
  });

  it("maps upstream errors to friendly bilingual messages", () => {
    expect(upstreamMessage(new AgentsApiError("x", 401)).code).toBe("key_rejected");
    expect(upstreamMessage(new AgentsApiError("x", 403)).message).toContain(REQUIRED_SCOPES[0]);
    expect(upstreamMessage(new Error("boom")).status).toBe(502);
  });

  it("builds a shell-safe exec-server command with a key placeholder", () => {
    const cmd = execServerCommand("wss://example/remote?a=1&b='x'", "env_123");
    expect(cmd).toContain("CODEX_API_KEY='<your-environment-key>'");
    expect(cmd).toContain("--environment-id 'env_123'");
    expect(shq("it's")).toBe(`'it'"'"'s'`);
  });

  it("builds agent and environment bodies", () => {
    const a = factoryAgentBody("blank", "gpt-6-luna") as { model?: string };
    expect(a.model).toBe("gpt-6-luna");
    expect(factoryEnvironment("self_hosted")).toMatchObject({ type: "self_hosted" });
    expect(factoryEnvironment("openai_hosted")).toMatchObject({ type: "openai_hosted" });
  });
});

describe("User Chat providers", () => {
  beforeEach(() => vi.unstubAllGlobals());

  const env = {
    WAI_MODEL: "@cf/google/gemma-4-26b-a4b-it",
    WAI_THAI_MODEL: "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
    WAI_CODE_MODEL: "@cf/qwen/qwen2.5-coder-32b-instruct",
    WAI_IMAGE_MODEL: "@cf/black-forest-labs/flux-1-schnell",
    WAI_MAX_TOKENS: 1500,
  } as never;

  it("streams from Workers AI and falls back to HF DeepSeek when the binding fails", async () => {
    const { runPlainTurn } = await import("@/lib/chat/plain-turn");
    const ai = { run: vi.fn().mockRejectedValue(new Error("3040: capacity")) };
    const sse = 'data: {"choices":[{"delta":{"content":"สวัสดี"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\ndata: [DONE]\n\n';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } })));
    const events: { t: string }[] = [];
    const res = await runPlainTurn({
      db: fakeD1(),
      env,
      server: { HF_TOKEN: "hf_testtoken0123456789abcdef", HF_MODEL: "deepseek-ai/DeepSeek-V3", HF_BASE_URL: "https://router.huggingface.co/v1", HF_TIMEOUT_MS: 30000, HF_MAX_TOKENS: 500 } as never,
      ai: ai as never,
      mode: "thai",
      history: [],
      userText: "สวัสดี",
      assistantMessageId: "m1",
      conversationId: "c1",
      emit: (e) => events.push(e),
      timeoutMs: 10_000,
    });
    expect(ai.run).toHaveBeenCalled();
    expect(ai.run.mock.calls[0][0]).toBe("@cf/aisingapore/gemma-sea-lion-v4-27b-it");
    expect(res.outcome).toBe("completed");
    expect(res.provider?.kind).toBe("hf");
    expect(events.map((e) => e.t)).toContain("done");
  });

  it("reports a friendly error when every provider fails", async () => {
    const { runPlainTurn } = await import("@/lib/chat/plain-turn");
    const events: { t: string; code?: string }[] = [];
    const res = await runPlainTurn({
      db: fakeD1(),
      env,
      server: { HF_TOKEN: undefined, HF_MODEL: "x" } as never,
      ai: { run: vi.fn().mockRejectedValue(new Error("down")) } as never,
      mode: "general",
      history: [],
      userText: "hi",
      assistantMessageId: "m1",
      conversationId: "c1",
      emit: (e) => events.push(e as never),
      timeoutMs: 10_000,
    });
    expect(res.outcome).toBe("failed");
    expect(events.at(-1)).toMatchObject({ t: "error", code: "provider_failed" });
  });

  it("generates a FLUX image through the AI binding", async () => {
    const { runImageTurn } = await import("@/lib/chat/plain-turn");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).toString("base64");
    const ai = { run: vi.fn().mockResolvedValue({ image: png }) };
    const events: { t: string; url?: string }[] = [];
    const res = await runImageTurn({ db: fakeD1(), env, server: {} as never, ai: ai as never, userText: "a cat", assistantMessageId: "m", conversationId: "c", emit: (e) => events.push(e as never) });
    expect(res.outcome).toBe("completed");
    expect(ai.run.mock.calls[0][0]).toBe("@cf/black-forest-labs/flux-1-schnell");
    expect(events.find((e) => e.t === "image")?.url).toBe("/api/chat/images/img-1");
  });
});
