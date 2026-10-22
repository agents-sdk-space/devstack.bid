import { describe, expect, it, vi, afterEach } from "vitest";

const { socketFetch } = vi.hoisted(() => ({ socketFetch: vi.fn(async () => new Response(JSON.stringify({ id: 7, slug: "devstack-bid-deploy-1", owner: { login: "agents-sdk-space" }, html_url: "https://github.com/apps/x", client_id: "c", client_secret: "s", webhook_secret: "w", pem: "p" }), { status: 201 })) }));
vi.mock("@/lib/server/socket-fetch", () => ({ socketFetch }));

import { convertManifest } from "@/lib/github/app-manifest";

afterEach(() => vi.unstubAllGlobals());

describe("convertManifest on a custom-domain Worker", () => {
  it("retries a Cloudflare 525 from api.github.com over the raw socket (prod failure 2026-10-22)", async () => {
    const f = vi.fn(async () => new Response("", { status: 525 }));
    vi.stubGlobal("fetch", f);
    const b = await convertManifest("abcdef123456");
    expect(f).toHaveBeenCalledOnce();
    expect(socketFetch).toHaveBeenCalledOnce();
    const [url, init] = socketFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/app-manifests/abcdef123456/conversions");
    expect(init.method).toBe("POST");
    expect(b.slug).toBe("devstack-bid-deploy-1");
  });
});
