import { describe, expect, it, vi } from "vitest";
import { TURNSTILE_ACTION, isTestSecret, turnstileSiteKey, verifyTurnstile } from "@/lib/auth/turnstile";
import { TURNSTILE_ACTION as CLIENT_ACTION } from "@/components/login-form";
import { contentSecurityPolicy } from "@/lib/security-headers";

const REAL = { TURNSTILE_SECRET_KEY: "0x4AAAAAAA-not-a-real-secret-000000", TURNSTILE_SITE_KEY: "0x4AAAAAAFXrTVkaNC9mWvUR", TURNSTILE_HOSTNAMES: "devstack.bid" };
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("turnstile siteverify", () => {
  it("is off without a secret (form keeps working, no widget)", async () => {
    expect(await verifyTurnstile(undefined, null, { source: {} })).toEqual({ ok: true, skipped: true });
    expect(turnstileSiteKey({ TURNSTILE_SITE_KEY: "x" })).toBe("");
  });
  it("client and server use the same action", () => expect(CLIENT_ACTION).toBe(TURNSTILE_ACTION));
  it("rejects a missing token without calling Siteverify", async () => {
    const f = reply({});
    expect((await verifyTurnstile("", null, { source: REAL, fetchImpl: f })).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("accepts success with the right action and hostname, sending idempotency_key", async () => {
    const f = reply({ success: true, action: TURNSTILE_ACTION, hostname: "devstack.bid" });
    expect(await verifyTurnstile("tok", "1.2.3.4", { source: REAL, fetchImpl: f, idempotencyKey: "k1" })).toEqual({ ok: true });
    const body = (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.get("idempotency_key")).toBe("k1");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });
  it("rejects wrong hostname, wrong action and failures (incl. replay)", async () => {
    expect(await verifyTurnstile("t", null, { source: REAL, fetchImpl: reply({ success: true, action: TURNSTILE_ACTION, hostname: "evil.example" }) })).toEqual({ ok: false, reason: "hostname-mismatch" });
    expect(await verifyTurnstile("t", null, { source: REAL, fetchImpl: reply({ success: true, action: "signup", hostname: "devstack.bid" }) })).toEqual({ ok: false, reason: "action-mismatch" });
    expect(await verifyTurnstile("t", null, { source: REAL, fetchImpl: reply({ success: false, "error-codes": ["timeout-or-duplicate"] }) })).toEqual({ ok: false, reason: "timeout-or-duplicate" });
  });
  it("retries once with the same idempotency key on a network error, then fails closed", async () => {
    const f = vi.fn(async () => { throw new Error("net"); });
    expect(await verifyTurnstile("t", null, { source: REAL, fetchImpl: f as unknown as typeof fetch, idempotencyKey: "same" })).toEqual({ ok: false, reason: "unavailable" });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("test secrets skip hostname/action (dummy values), real secrets never do", async () => {
    expect(isTestSecret("1x0000000000000000000000000000000AA")).toBe(true);
    expect(isTestSecret(REAL.TURNSTILE_SECRET_KEY)).toBe(false);
    const src = { TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" };
    expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", null, { source: src, fetchImpl: reply({ success: true, hostname: "example.com", action: "" }) })).toEqual({ ok: true });
  });
  it("CSP allows the Turnstile script and frame", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src [^;]*https:\/\/challenges\.cloudflare\.com/);
  });
});
