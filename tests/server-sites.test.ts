import { describe, expect, it } from "vitest";
import { deployServerWorker, readServerBundle, serverWorkerName } from "@/lib/hosting/server-worker";
import { proxyToWorker, serveSite } from "@/lib/hosting/serve";

const enc = (s: string) => new TextEncoder().encode(s);

describe("server bundles", () => {
  it("detects server.json + worker/worker.js and keeps safe flags only", () => {
    const b = readServerBundle([
      { path: "./server.json", bytes: enc(JSON.stringify({ compatibility_date: "2026-10-01", compatibility_flags: ["global_fetch_strictly_public", "bad flag!"] })) },
      { path: "./worker/worker.js", bytes: enc("export default {}") },
      { path: "./assets/_next/static/a.js", bytes: enc("x") },
      { path: "./assets/", bytes: enc("") },
    ]);
    expect(b?.compatibilityFlags).toEqual(["global_fetch_strictly_public", "nodejs_compat"]);
    expect(b?.assets.map((a) => a.path)).toEqual(["/_next/static/a.js"]);
  });
  it("is null for static output", () => expect(readServerBundle([{ path: "./index.html", bytes: enc("<h1>") }])).toBeNull());
  it("names workers site-<slug> and rejects junk", () => {
    expect(serverWorkerName("shop-1")).toBe("site-shop-1");
    expect(() => serverWorkerName("A B")).toThrow();
  });
  it("uploads assets, then the script, then enables workers.dev; token only in Authorization", async () => {
    const calls: { url: string; auth: string | null; method?: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get("authorization"), method: init.method });
      const result = url.includes("assets-upload-session") ? { jwt: "sess", buckets: [[Object.keys(JSON.parse(String(init.body)).manifest).length ? "x" : ""]] } : url.includes("assets/upload") ? { jwt: "done" } : { id: "v1" };
      return new Response(JSON.stringify({ success: true, result }), { status: 200 });
    }) as unknown as typeof fetch;
    const b = readServerBundle([
      { path: "server.json", bytes: enc("{}") }, { path: "worker/worker.js", bytes: enc("export default {}") }, { path: "assets/a.css", bytes: enc("a") },
    ])!;
    const r = await deployServerWorker({ accountId: "acc", token: "T", fetcher }, "site-x", b);
    expect(r.assets).toBe(1);
    expect(calls.map((c) => c.url.replace("https://api.cloudflare.com/client/v4/accounts/acc", ""))).toEqual([
      "/workers/scripts/site-x/assets-upload-session", "/workers/assets/upload?base64=true", "/workers/scripts/site-x", "/workers/scripts/site-x/subdomain",
    ]);
    expect(calls[1].auth).toBe("Bearer sess");
    expect(calls[2].auth).toBe("Bearer T");
  });
  it("surfaces Cloudflare API errors", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }), { status: 403 })) as unknown as typeof fetch;
    const b = readServerBundle([{ path: "server.json", bytes: enc("{}") }, { path: "worker/worker.js", bytes: enc("x") }])!;
    await expect(deployServerWorker({ accountId: "a", token: "t", fetcher }, "site-x", b)).rejects.toThrow(/cf_api 403 10000/);
  });
});

describe("devstack-sites server proxy", () => {
  const bucket = (rec: unknown) => ({ get: async (k: string) => (k === "hosts/shop.json" ? { text: async () => JSON.stringify(rec) } : null), put: async () => undefined }) as never;
  it("proxies any method to site-<slug>.<sub>.workers.dev with forwarded host", async () => {
    let seen: { url: string; method?: string; host: string | null } | null = null;
    const fetcher = (async (url: string, init: RequestInit) => { seen = { url, method: init.method, host: new Headers(init.headers).get("x-forwarded-host") }; return new Response("{}", { status: 201 }); }) as unknown as typeof fetch;
    const res = await serveSite(new Request("https://shop.devstack.bid/api/x?q=1", { method: "POST", body: "a" }), bucket({ projectId: "p", deploymentId: "d1234567", worker: "site-shop" }), "devstack.bid", { workersSubdomain: "sub", fetcher });
    expect(res.status).toBe(201);
    expect(seen).toEqual({ url: "https://site-shop.sub.workers.dev/api/x?q=1", method: "POST", host: "shop.devstack.bid" });
  });
  it("ignores worker names that are not site-*", async () => {
    const res = await serveSite(new Request("https://shop.devstack.bid/", { method: "POST" }), bucket({ projectId: "p", deploymentId: "d1234567", worker: "nvx-stack-builder" }), "devstack.bid", { workersSubdomain: "sub", fetcher: (() => { throw new Error("no"); }) as never });
    expect(res.status).toBe(405);
  });
  it("rewrites same-origin redirects to the public host", async () => {
    const fetcher = (async () => new Response(null, { status: 307, headers: { location: "https://site-shop.sub.workers.dev/login" } })) as unknown as typeof fetch;
    const res = await proxyToWorker(new Request("https://shop.devstack.bid/"), "site-shop", "sub", fetcher);
    expect(res.headers.get("location")).toBe("https://shop.devstack.bid/login");
  });
});
