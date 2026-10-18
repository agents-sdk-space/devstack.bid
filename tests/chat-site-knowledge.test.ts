import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { chatSite, trustedClientIp } from "@/lib/server/trusted-proxy";
import { isSdkQuestion, sdkContext, stripProxyContext, PROXY_CONTEXT_MARK } from "@/lib/chat/knowledge/retrieve";
import { systemPromptFor, USER_SYSTEM_PROMPT } from "@/lib/chat/plain-turn";

const KEY = "k".repeat(40);
const req = (h: Record<string, string>) => new Request("https://devstack.bid/api/chat/turn", { method: "POST", headers: h });

describe("trusted proxy", () => {
  it("reads the site header, defaulting to devstack.bid", () => {
    expect(chatSite(req({ "x-nvx-site": "implemented.stream" }))).toBe("implemented.stream");
    expect(chatSite(req({ "x-nvx-site": "evil.example" }))).toBe("devstack.bid");
    expect(chatSite(req({}))).toBe("devstack.bid");
  });
  it("trusts the forwarded IP only with the right key", () => {
    expect(trustedClientIp(req({ "x-nvx-proxy-key": KEY, "x-nvx-client-ip": "203.0.113.9" }), KEY)).toBe("203.0.113.9");
    expect(trustedClientIp(req({ "x-nvx-proxy-key": KEY, "x-nvx-client-ip": "2001:db8::1" }), KEY)).toBe("2001:db8::1");
    expect(trustedClientIp(req({ "x-nvx-proxy-key": "x".repeat(40), "x-nvx-client-ip": "203.0.113.9" }), KEY)).toBeNull();
    expect(trustedClientIp(req({ "x-nvx-proxy-key": KEY, "x-nvx-client-ip": "999.1.1.1" }), KEY)).toBeNull();
    expect(trustedClientIp(req({ "x-nvx-proxy-key": KEY, "x-nvx-client-ip": "not-an-ip" }), KEY)).toBeNull();
    expect(trustedClientIp(req({ "x-nvx-client-ip": "203.0.113.9" }), undefined)).toBeNull();
  });
});

describe("SDK knowledge", () => {
  it("adds notes only for SDK questions, within the cap", () => {
    expect(isSdkQuestion("How do I approve a tool call with useAgentChat?")).toBe(true);
    expect(sdkContext("How do I approve a tool call with useAgentChat?", 900).length).toBeLessThanOrEqual(900);
    expect(sdkContext("How do I approve a tool call with useAgentChat?")).toContain("addToolApprovalResponse");
    expect(sdkContext("แต่งกลอนเรื่องทะเลให้หน่อย")).toBe("");
  });
  it("strips notes appended by the implemented.stream proxy", () => {
    expect(stripProxyContext(`hello${PROXY_CONTEXT_MARK}Reference notes...`)).toBe("hello");
    expect(stripProxyContext("plain")).toBe("plain");
  });
  it("builds the persona per site", () => {
    expect(systemPromptFor("devstack.bid", false, "hi")).toBe(USER_SYSTEM_PROMPT);
    const is = systemPromptFor("implemented.stream", false, "What does useAgent return?");
    expect(is).toContain("Bugbot");
    expect(is).toContain("implemented.stream/guide/chat-client-sdk");
    expect(is).not.toContain("/chat/dev");
    expect(systemPromptFor("devstack.bid", true, "hi")).toContain("code mode");
  });
});
