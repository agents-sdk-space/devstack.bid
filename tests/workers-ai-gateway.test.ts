import { describe, expect, it } from "vitest";
import { chatEnv } from "@/lib/chat/config";
import { gatewayRunOptions, waiChatStream, waiImage, type AiBinding } from "@/lib/ai/workers-ai";

function fakeAi() {
  const calls: { model: string; input: Record<string, unknown>; options?: Record<string, unknown> }[] = [];
  const ai: AiBinding = {
    async run(model, input, options) {
      calls.push({ model, input, options });
      if ("prompt" in input) return { image: btoa("\u0089PNG....") };
      return { response: "hi", usage: { prompt_tokens: 1, completion_tokens: 1 } };
    },
  };
  return { ai, calls };
}

describe("Workers AI through Cloudflare AI Gateway", () => {
  it("adds no options when no gateway id is configured", () => {
    expect(gatewayRunOptions()).toBeUndefined();
    expect(gatewayRunOptions("")).toBeUndefined();
  });

  it("passes the gateway id and never caches replies", () => {
    expect(gatewayRunOptions("my-gateway")).toEqual({ gateway: { id: "my-gateway", skipCache: true } });
  });

  it("routes streamed chat through the gateway only when an id is given", async () => {
    const direct = fakeAi();
    for await (const _ of waiChatStream(direct.ai, "@cf/m", [{ role: "user", content: "x" }], 100)) void _;
    expect(direct.calls[0].options).toBeUndefined();

    const routed = fakeAi();
    const deltas: string[] = [];
    for await (const ev of waiChatStream(routed.ai, "@cf/m", [{ role: "user", content: "x" }], 100, "my-gateway")) if ("delta" in ev) deltas.push(ev.delta);
    expect(routed.calls[0].options).toEqual({ gateway: { id: "my-gateway", skipCache: true } });
    expect(deltas.join("")).toBe("hi");
  });

  it("routes image generation through the gateway", async () => {
    const routed = fakeAi();
    await waiImage(routed.ai, "@cf/flux", "a cat", 4, "my-gateway");
    expect(routed.calls[0].options).toEqual({ gateway: { id: "my-gateway", skipCache: true } });
  });

  it("accepts a valid gateway id and ignores an unsafe one", () => {
    expect(chatEnv({ CF_AI_GATEWAY_ID: "default" }).CF_AI_GATEWAY_ID).toBe("default");
    expect(chatEnv({ CF_AI_GATEWAY_ID: "bad id/../x" }).CF_AI_GATEWAY_ID).toBe("");
    expect(chatEnv({}).CF_AI_GATEWAY_ID).toBe("");
  });
});
