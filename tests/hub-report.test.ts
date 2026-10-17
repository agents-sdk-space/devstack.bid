import { describe, expect, it, vi } from "vitest";
import { loginOutcome, sendHubEvent } from "@/lib/hub/report";

const KEY = "k".repeat(64);

describe("stack-hub reporter", () => {
  it("posts over the service binding with the bearer key and drops undefined fields", async () => {
    const fetch = vi.fn<(req: Request | string) => Promise<Response>>(async () => new Response(null, { status: 202 }));
    const ok = await sendHubEvent({ binding: { fetch }, key: KEY }, "chat_turn", { outcome: "ok", mode: "thai", usageIn: undefined });
    expect(ok).toBe(true);
    const req = fetch.mock.calls[0][0] as Request;
    expect(req.url).toBe("https://stack-hub.internal/api/v1/events");
    expect(req.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(await req.json()).toEqual({ site: "devstack.bid", type: "chat_turn", payload: { outcome: "ok", mode: "thai" } });
  });

  it("falls back to HUB_URL and is off without a key", async () => {
    const f = vi.fn<(url: string) => Promise<Response>>(async () => new Response(null, { status: 202 }));
    expect(await sendHubEvent({ url: "https://hub.example/", key: KEY }, "x", {}, f as unknown as typeof fetch)).toBe(true);
    expect(f.mock.calls[0][0]).toBe("https://hub.example/api/v1/events");
    expect(await sendHubEvent({ url: "https://hub.example" }, "x", {})).toBe(false);
    expect(await sendHubEvent({ key: KEY }, "x", {})).toBe(false);
  });

  it("never throws when the hub is down", async () => {
    const down = { fetch: async () => { throw new TypeError("down"); } };
    await expect(sendHubEvent({ binding: down, key: KEY }, "chat_turn", {})).resolves.toBe(false);
  });

  it("classifies GitHub callback redirects without reading logins", () => {
    const at = (loc: string) => new Response(null, { status: 302, headers: { location: loc } });
    expect(loginOutcome(at("https://devstack.bid/login?auth=denied&provider=github"))).toEqual({ outcome: "failed", reason: "denied" });
    expect(loginOutcome(at("https://devstack.bid/login?auth=weird&provider=github"))).toEqual({ outcome: "failed", reason: "error" });
    expect(loginOutcome(at("https://devstack.bid/chat"))).toEqual({ outcome: "ok", reason: null });
  });
});
