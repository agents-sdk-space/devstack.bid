import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { dechunk, parseHttpResponse, socketFetch, type ConnectFn } from "@/lib/server/socket-fetch";
import { MAX_WEBHOOK_BYTES, verifyWebhook } from "@/lib/github/webhook";
import { redactSecrets } from "@/lib/ai/openai";

const enc = (s: string) => new TextEncoder().encode(s);

describe("socket-fetch hardening", () => {
  it("times out and closes the socket", async () => {
    let closed = false;
    const hang: ConnectFn = () => ({ readable: new ReadableStream({ start() {} }), writable: new WritableStream(), close: () => { closed = true; } });
    await expect(socketFetch("https://github.com/x", {}, hang, 50)).rejects.toThrow(/timeout/);
    expect(closed).toBe(true);
  });
  it("rejects truncated chunked and content-length bodies", () => {
    expect(() => dechunk(enc("10\r\nshort"))).toThrow(/truncated/);
    expect(() => parseHttpResponse(enc("HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nabc"))).toThrow(/truncated/);
    expect(parseHttpResponse(enc("HTTP/1.1 200 OK\r\nContent-Length: 3\r\n\r\nabcEXTRA")).status).toBe(200);
  });
});

describe("one redaction engine", () => {
  it("redactSecrets uses sanitizeLog patterns", () => {
    expect(redactSecrets(`t=ghp_${"a".repeat(36)}`)).not.toContain("aaaa");
    expect(redactSecrets("x my-secret-1 y", "my-secret-1")).toBe("x [redacted] y");
  });
});

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc(body)));
  return "sha256=" + [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const req = (body: string, h: Record<string, string>) => new Request("https://devstack.bid/api/github/webhook", { method: "POST", body, headers: { "content-type": "application/json", ...h } });
const DELIVERY = "72d3162e-cc78-11e3-81ab-4c9367dc0958";

describe("GitHub webhook verification", () => {
  const secretFor = async (id: number | null) => (id === 42 ? "install-42-secret" : "app-secret");
  it("accepts a valid signature, per-installation secret, delivery id as key", async () => {
    const body = JSON.stringify({ installation: { id: 42 }, repository: { id: 7 } });
    const r = await verifyWebhook(req(body, { "x-hub-signature-256": await sign("install-42-secret", body), "x-github-delivery": DELIVERY, "x-github-event": "push" }), secretFor);
    expect(r).toMatchObject({ ok: true, delivery: DELIVERY, event: "push", installationId: 42 });
  });
  it("rejects missing/invalid signatures, unknown events, bad delivery ids and big bodies", async () => {
    const body = JSON.stringify({ installation: { id: 42 } });
    const ok = { "x-github-delivery": DELIVERY, "x-github-event": "push" };
    expect(await verifyWebhook(req(body, ok), secretFor)).toMatchObject({ ok: false, status: 401, reason: "missing_signature" });
    expect(await verifyWebhook(req(body, { ...ok, "x-hub-signature-256": await sign("app-secret", body) }), secretFor)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(await verifyWebhook(req(body, { ...ok, "x-hub-signature-256": "sha256=zz" }), secretFor)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(await verifyWebhook(req(body, { ...ok, "x-github-event": "repository_dispatch", "x-hub-signature-256": "sha256=00" }), secretFor)).toMatchObject({ ok: false, reason: "event_not_allowed" });
    expect(await verifyWebhook(req(body, { ...ok, "x-github-delivery": "../x", "x-hub-signature-256": "sha256=00" }), secretFor)).toMatchObject({ ok: false, reason: "missing_delivery" });
    const big = "x".repeat(MAX_WEBHOOK_BYTES + 1);
    expect(await verifyWebhook(req(big, { ...ok, "x-hub-signature-256": await sign("app-secret", big) }), secretFor)).toMatchObject({ ok: false, status: 413 });
  });
});
