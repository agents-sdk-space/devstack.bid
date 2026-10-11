import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { redactSecrets } from "@/lib/ai/openai";
import { KNOWN_TEMPLATE_IDS } from "@/data/template-ids";
import { TEMPLATES } from "@/data/templates";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";
import { serverEnv } from "@/lib/server/env";
import { HttpError, readJsonBody, withTimeout } from "@/lib/server/http";

const jsonReq = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/plan", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });

describe("serverEnv", () => {
  it("applies defaults", () => {
    const env = serverEnv({});
    expect(env.OPENAI_MODEL).toBe("gpt-6.1-sol");
    expect(env.OPENAI_MAX_OUTPUT_TOKENS).toBe(6000);
    expect(env.OPENAI_TIMEOUT_MS).toBe(60000);
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("accepts valid overrides and rejects invalid ones without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = serverEnv({ OPENAI_MODEL: "gpt-x.mini", OPENAI_MAX_OUTPUT_TOKENS: "999999", OPENAI_TIMEOUT_MS: "20000", OPENAI_API_KEY: "not a key!" });
    expect(env.OPENAI_MODEL).toBe("gpt-x.mini");
    expect(env.OPENAI_MAX_OUTPUT_TOKENS).toBe(6000); // above the 16000 cap → default
    expect(env.OPENAI_TIMEOUT_MS).toBe(20000);
    expect(env.OPENAI_API_KEY).toBeUndefined();
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("OPENAI_MAX_OUTPUT_TOKENS");
    expect(logged).not.toContain("not a key!");
    warn.mockRestore();
  });
});

describe("readJsonBody", () => {
  it("parses JSON within the limit", async () => {
    await expect(readJsonBody(jsonReq('{"a":1}'), 100)).resolves.toEqual({ a: 1 });
  });
  it("rejects non-JSON content types with 415", async () => {
    await expect(readJsonBody(jsonReq("{}", { "content-type": "text/plain" }), 100)).rejects.toMatchObject({ status: 415 });
  });
  it("rejects oversized bodies with 413 even without a Content-Length", async () => {
    const big = JSON.stringify({ prompt: "x".repeat(500) });
    await expect(readJsonBody(jsonReq(big), 100)).rejects.toMatchObject({ status: 413 });
    await expect(readJsonBody(jsonReq("{}", { "content-length": "999999" }), 100)).rejects.toMatchObject({ status: 413 });
  });
  it("rejects invalid JSON with 400", async () => {
    await expect(readJsonBody(jsonReq("{nope"), 100)).rejects.toBeInstanceOf(HttpError);
  });
});

describe("withTimeout", () => {
  it("rejects with 504 when the work is too slow", async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toMatchObject({ status: 504 });
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });
});

describe("redactSecrets", () => {
  it("removes explicit secrets, sk- keys, bearer tokens and Cloudflare tokens", () => {
    const key = "sk-proj-abcdefghijklmnopqrstuvwxyz0123";
    const out = redactSecrets(`bad key ${key} Bearer abc.def cfat_ABCDEFGH12345678 custom-secret-123`, "custom-secret-123");
    expect(out).not.toContain("abcdefghijkl");
    expect(out).not.toContain("abc.def");
    expect(out).not.toContain("ABCDEFGH1234");
    expect(out).not.toContain("custom-secret-123");
  });
});

describe("canonical host", () => {
  it("redirects www.devstack.bid permanently to the apex, keeping the path", async () => {
    const rules = await nextConfig.redirects!();
    expect(rules).toContainEqual({
      source: "/:path*",
      has: [{ type: "host", value: "www.devstack.bid" }],
      destination: "https://devstack.bid/:path*",
      permanent: true,
    });
  });
});

describe("security headers", () => {
  const prod = Object.fromEntries(securityHeaders(false).map((h) => [h.key, h.value]));
  it("sets the hardening headers in production", () => {
    for (const k of ["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "X-Frame-Options"]) {
      expect(prod[k], k).toBeTruthy();
    }
    expect(prod["X-Content-Type-Options"]).toBe("nosniff");
  });
  it("HSTS is scoped to the host only (served on the zone apex devstack.bid)", () => {
    expect(prod["Strict-Transport-Security"]).toBe("max-age=31536000");
    expect(prod["Strict-Transport-Security"]).not.toMatch(/includeSubDomains|preload/);
    const assets = readFileSync(join(__dirname, "../public/_headers"), "utf8");
    expect(assets).toContain("Strict-Transport-Security: max-age=31536000\n");
    expect(securityHeaders(true).some((h) => h.key === "Strict-Transport-Security")).toBe(false);
  });
  it("CSP forbids framing, plugins and foreign connections; eval only in dev", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("https://static.cloudflareinsights.com");
    expect(csp).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy(true)).toContain("unsafe-eval");
  });
});

describe("template id list used by the 404 rewrite in next.config.ts", () => {
  it("matches the template registry", () => {
    expect([...KNOWN_TEMPLATE_IDS].sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
  });
});

describe("POST /api/plan hardening", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  async function route(env: Record<string, string> = {}) {
    vi.stubEnv("OPENAI_API_KEY", env.OPENAI_API_KEY ?? "");
    vi.stubEnv("HF_TOKEN", env.HF_TOKEN ?? "");
    vi.stubEnv("OPENAI_FALLBACK", env.OPENAI_FALLBACK ?? (env.OPENAI_API_KEY && !env.HF_TOKEN ? "true" : "false"));
    vi.stubEnv("PLAN_LIMIT_PER_MIN", env.PLAN_LIMIT_PER_MIN ?? "20");
    vi.stubEnv("PLAN_AI_LIMIT_PER_MIN", env.PLAN_AI_LIMIT_PER_MIN ?? "5");
    return import("@/app/api/plan/route");
  }

  it("returns 415 / 413 / 400 for bad requests", async () => {
    const { POST } = await route();
    expect((await POST(jsonReq("{}", { "content-type": "text/plain", "cf-connecting-ip": "1.1.1.1" }))).status).toBe(415);
    expect((await POST(jsonReq(JSON.stringify({ prompt: "x".repeat(20_000) }), { "cf-connecting-ip": "1.1.1.2" }))).status).toBe(413);
    expect((await POST(jsonReq(JSON.stringify({ prompt: "" }), { "cf-connecting-ip": "1.1.1.3" }))).status).toBe(400);
  });

  it("tries Hugging Face first and never falls back to the server OpenAI key unless OPENAI_FALLBACK=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "overloaded" }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await route({ HF_TOKEN: "hf_testtoken0123456789abcdef", OPENAI_API_KEY: "sk-test-server-key-0123456789abcdef", OPENAI_FALLBACK: "false" });
    const res = await POST(jsonReq(JSON.stringify({ prompt: "booking site", lang: "en" }), { "cf-connecting-ip": "7.7.7.1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("fallback");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("router.huggingface.co");
    expect(JSON.stringify(body)).not.toContain("hf_testtoken");
    vi.unstubAllGlobals();
  });

  it("serves the offline planner and returns 429 with Retry-After past the per-IP limit", async () => {
    const { POST } = await route({ PLAN_LIMIT_PER_MIN: "3" });
    const send = () => POST(jsonReq(JSON.stringify({ prompt: "sales dashboard", mode: "fallback" }), { "cf-connecting-ip": "9.9.9.9" }));
    for (let i = 0; i < 3; i++) {
      const res = await send();
      expect(res.status).toBe(200);
      expect((await res.json()).source).toBe("fallback");
    }
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect(blocked.headers.get("Cache-Control")).toBe("no-store");
  });

  it("limits AI requests that use the server key, but not requests with the user's own key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await route({ OPENAI_API_KEY: "sk-test-server-key-0123456789abcdef", PLAN_AI_LIMIT_PER_MIN: "1" });
    const ai = (headers: Record<string, string> = {}) =>
      POST(jsonReq(JSON.stringify({ prompt: "แดชบอร์ดยอดขาย", lang: "th" }), { "cf-connecting-ip": "8.8.8.8", ...headers }));
    const first = await ai();
    expect(first.status).toBe(200); // upstream error → graceful fallback
    const body = await first.json();
    expect(body.source).toBe("fallback");
    expect(JSON.stringify(body)).not.toContain("sk-test-server-key");
    expect((await ai()).status).toBe(429);
    expect((await ai({ "x-openai-key": "sk-user-own-key-0123456789abcdefgh" })).status).toBe(200);
    // the OpenAI call carried the cost cap
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.max_output_tokens).toBeLessThanOrEqual(16000);
    expect(sent.store).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("clientIp", () => {
  it("groups IPv6 clients by /64 and keeps IPv4 as-is", async () => {
    const { clientIp, ipv6Prefix64 } = await import("@/lib/server/http");
    const r = (ip: string) => new Request("http://x/", { headers: { "cf-connecting-ip": ip } });
    expect(clientIp(r("203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(r("2a09:bac5:56bb:4aa::77:94"))).toBe("2a09:bac5:56bb:4aa::/64");
    expect(clientIp(r("2a09:bac5:56bb:04aa:0:0:77:a8"))).toBe("2a09:bac5:56bb:4aa::/64");
    expect(ipv6Prefix64("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipv6Prefix64("::ffff:1.2.3.4")).toBeNull();
    expect(ipv6Prefix64("not-an-ip")).toBeNull();
    expect(clientIp(new Request("http://x/"))).toBe("local");
  });
});
