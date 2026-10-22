import { describe, expect, it } from "vitest";
import { assertCustomerWorker, checkOwnership, deployServerWorker, GUARD_MODULE, OWNER_TAG, proxyKey, readServerBundle, serverWorkerName, SERVER_COMPAT_DATE } from "@/lib/hosting/server-worker";
import { proxyToWorker, serveSite } from "@/lib/hosting/serve";

const enc = (s: string) => new TextEncoder().encode(s);
const W = "site-0123456789abcdef0123";

describe("server bundles", () => {
  it("ignores customer server.json: platform-fixed flags and pinned date", () => {
    const b = readServerBundle([
      { path: "./server.json", bytes: enc(JSON.stringify({ compatibility_date: "2020-01-01", compatibility_flags: ["global_fetch_public", "allow_private_fetch"] })) },
      { path: "./worker/worker.js", bytes: enc("export default {}") },
      { path: "./assets/_next/static/a.js", bytes: enc("x") },
      { path: "./assets/", bytes: enc("") },
    ]);
    expect(b?.compatibilityFlags).toEqual(["nodejs_compat", "global_fetch_strictly_public"]);
    expect(b?.compatibilityDate).toBe(SERVER_COMPAT_DATE);
    expect(b?.assets.map((a) => a.path)).toEqual(["/_next/static/a.js"]);
  });
  it("does not even parse server.json (garbage is fine)", () => {
    expect(readServerBundle([{ path: "server.json", bytes: enc("{not json") }, { path: "worker/worker.js", bytes: enc("x") }])?.compatibilityFlags).toEqual(["nodejs_compat", "global_fetch_strictly_public"]);
  });
  it("is null for static output", () => expect(readServerBundle([{ path: "./index.html", bytes: enc("<h1>") }])).toBeNull());
});

describe("worker names", () => {
  it("derive from project id (+ deployment id for previews), not slug", async () => {
    const prod = await serverWorkerName("proj-1");
    const prev = await serverWorkerName("proj-1", "dep-1");
    expect(prod).toMatch(/^site-[a-f0-9]{20}$/);
    expect(prev).toMatch(/^site-[a-f0-9]{20}-[a-f0-9]{12}$/);
    expect(prev.startsWith(prod)).toBe(true);
    expect(prev).not.toBe(prod);
    expect(await serverWorkerName("proj-2")).not.toBe(prod);
    expect(await serverWorkerName("proj-1")).toBe(prod);
  });
  it("hard-rejects platform and non-site names", () => {
    for (const n of ["nvx-stack-builder", "devstack-sites", "dev", "devtest", "implemented-stream", "site-shop", "site-", "site-0123456789abcdef0123/../x", "SITE-0123456789abcdef0123"]) expect(() => assertCustomerWorker(n)).toThrow();
    expect(assertCustomerWorker(W)).toBe(W);
  });
});

function cfMock(opts: { tags?: string[] | null; exists?: boolean } = {}) {
  const calls: { url: string; auth: string | null; method?: string; body?: unknown }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, auth: new Headers(init.headers).get("authorization"), method: init.method, body: init.body });
    if (url.endsWith("/script-settings")) {
      if (!opts.exists) return new Response(JSON.stringify({ success: false, errors: [{ code: 10007, message: "This Worker does not exist on your account." }] }), { status: 404 });
      return new Response(JSON.stringify({ success: true, result: { tags: opts.tags ?? [] } }), { status: 200 });
    }
    const result = url.includes("assets-upload-session") ? { jwt: "sess", buckets: [["x"]] } : url.includes("assets/upload") ? { jwt: "done" } : { id: "v1" };
    return new Response(JSON.stringify({ success: true, result }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const bundle = () => readServerBundle([{ path: "server.json", bytes: enc("{}") }, { path: "worker/worker.js", bytes: enc("export default {}") }, { path: "assets/a.css", bytes: enc("a") }])!;

describe("deployServerWorker", () => {
  it("checks ownership, uploads assets, guard + script with fixed flags and owner tag; token only in Authorization", async () => {
    const { calls, fetcher } = cfMock();
    const r = await deployServerWorker({ accountId: "acc", token: "T", proxySecret: "s".repeat(40), fetcher }, W, bundle(), "proj-1");
    expect(r.assets).toBe(1);
    expect(calls.map((c) => c.url.replace("https://api.cloudflare.com/client/v4/accounts/acc", ""))).toEqual([
      `/workers/scripts/${W}/script-settings`, `/workers/scripts/${W}/assets-upload-session`, "/workers/assets/upload?base64=true", `/workers/scripts/${W}`, `/workers/scripts/${W}/subdomain`,
    ]);
    expect(calls[2].auth).toBe("Bearer sess");
    expect(calls[3].auth).toBe("Bearer T");
    const form = calls[3].body as FormData;
    const meta = JSON.parse(await (form.get("metadata") as Blob).text());
    expect(meta.main_module).toBe("devstack-guard.js");
    expect(meta.compatibility_flags).toEqual(["nodejs_compat", "global_fetch_strictly_public"]);
    expect(meta.compatibility_date).toBe(SERVER_COMPAT_DATE);
    expect(meta.tags).toEqual([OWNER_TAG("proj-1")]);
    const key = meta.bindings.find((b: { name: string }) => b.name === "DEVSTACK_PROXY_KEY");
    expect(key.text).toBe(await proxyKey("s".repeat(40), W));
    expect(key.text).not.toContain("s".repeat(10));
    expect(await (form.get("devstack-guard.js") as Blob).text()).toBe(GUARD_MODULE);
  });
  it("refuses to overwrite a Worker owned by another project (slug reuse)", async () => {
    const { calls, fetcher } = cfMock({ exists: true, tags: [OWNER_TAG("other")] });
    await expect(deployServerWorker({ accountId: "a", token: "t", proxySecret: "s".repeat(40), fetcher }, W, bundle(), "proj-1")).rejects.toThrow("worker_owner_mismatch");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });
  it("updates its own Worker", async () => {
    const { fetcher } = cfMock({ exists: true, tags: [OWNER_TAG("proj-1")] });
    expect(await checkOwnership({ accountId: "a", token: "t", fetcher }, W, "proj-1")).toBe("owned");
  });
  it("never PUTs platform Worker names", async () => {
    const { calls, fetcher } = cfMock();
    await expect(deployServerWorker({ accountId: "a", token: "t", proxySecret: "s".repeat(40), fetcher }, "nvx-stack-builder", bundle(), "p")).rejects.toThrow("invalid_worker_name");
    expect(calls).toHaveLength(0);
  });
  it("CF errors become a code; message detail stays off the code", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error for account acc" }] }), { status: 403 })) as unknown as typeof fetch;
    const err = await deployServerWorker({ accountId: "a", token: "t", proxySecret: "s".repeat(40), fetcher }, W, bundle(), "p").catch((e) => e);
    expect(err.code).toBe("cf_api_403_10000");
    expect(err.message).not.toMatch(/account/);
  });
});

describe("guard module", () => {
  async function load() {
    const user = { default: { fetch: async (req: Request, env: Record<string, unknown>) => new Response(JSON.stringify({ proxy: req.headers.get("x-devstack-proxy"), keys: Object.keys(env) }), { headers: { "set-cookie": "a=b" } }) } };
    const src = GUARD_MODULE.replace('import * as user from "./worker.js";', "").replace('export * from "./worker.js";', "").replace("export default", "return");
    return new Function("user", src)(user) as { fetch(r: Request, e: unknown, c: unknown): Promise<Response> };
  }
  it("rejects direct hits without the key, passes keyed requests and hides the key", async () => {
    const g = await load();
    const env = { DEVSTACK_PROXY_KEY: "k".repeat(64), ASSETS: {} };
    const direct = await g.fetch(new Request("https://x.workers.dev/"), env, {});
    expect(direct.status).toBe(404);
    expect(direct.headers.get("x-devstack-origin")).toBe("guard");
    const wrong = await g.fetch(new Request("https://x.workers.dev/", { headers: { "x-devstack-proxy": "k".repeat(63) + "j" } }), env, {});
    expect(wrong.status).toBe(404);
    const ok = await g.fetch(new Request("https://x.workers.dev/", { headers: { "x-devstack-proxy": "k".repeat(64) } }), env, {});
    expect(ok.headers.get("x-devstack-origin")).toBe("project");
    expect(await ok.json()).toEqual({ proxy: null, keys: ["ASSETS"] });
  });
});

describe("devstack-sites server proxy", () => {
  const bucket = (rec: unknown) => ({ get: async (k: string) => (k === "hosts/shop.json" ? { text: async () => JSON.stringify(rec) } : null), put: async () => undefined }) as never;
  const project = (body: BodyInit | null, init: ResponseInit = {}) => new Response(body, { ...init, headers: { "x-devstack-origin": "project", ...(init.headers as Record<string, string> | undefined) } });

  it("proxies any method with forwarded host and the per-worker key", async () => {
    let seen: { url: string; method?: string; host: string | null; key: string | null } | null = null;
    const fetcher = (async (url: string, init: RequestInit) => { const h = new Headers(init.headers); seen = { url, method: init.method, host: h.get("x-forwarded-host"), key: h.get("x-devstack-proxy") }; return project("{}", { status: 201 }); }) as unknown as typeof fetch;
    const res = await serveSite(new Request("https://shop.devstack.bid/api/x?q=1", { method: "POST", body: "a" }), bucket({ projectId: "p", deploymentId: "d1234567", worker: W }), "devstack.bid", { workersSubdomain: "sub", fetcher, proxyKeyFor: async () => "KEY" });
    expect(res.status).toBe(201);
    expect(seen).toEqual({ url: `https://${W}.sub.workers.dev/api/x?q=1`, method: "POST", host: "shop.devstack.bid", key: "KEY" });
  });
  it("forwards only allowlisted request headers (no Cookie/Authorization/CF-*)", async () => {
    let h: Headers | null = null;
    const fetcher = (async (_u: string, init: RequestInit) => { h = new Headers(init.headers); return project("ok"); }) as unknown as typeof fetch;
    await proxyToWorker(new Request("https://shop.devstack.bid/", { headers: { cookie: "__Host-nvx_auth=secret", authorization: "Bearer x", "cf-connecting-ip": "1.2.3.4", "cf-access-jwt-assertion": "j", "x-devstack-proxy": "forged", accept: "text/html", rsc: "1" } }), W, "sub", { fetcher, proxyKey: "KEY" });
    expect(h!.get("cookie")).toBeNull();
    expect(h!.get("authorization")).toBeNull();
    expect(h!.get("cf-connecting-ip")).toBeNull();
    expect(h!.get("cf-access-jwt-assertion")).toBeNull();
    expect(h!.get("x-devstack-proxy")).toBe("KEY");
    expect(h!.get("accept")).toBe("text/html");
    expect(h!.get("rsc")).toBe("1");
  });
  it("strips every Set-Cookie (incl. Domain=devstack.bid) and applies platform headers + badge", async () => {
    const up = new Headers({ "x-devstack-origin": "project", "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'", "x-content-type-options": "none" });
    up.append("set-cookie", "__Host-nvx_auth=evil; Domain=devstack.bid; Path=/");
    up.append("set-cookie", "local=1; Path=/");
    const fetcher = (async () => new Response("<html><body>hi</body></html>", { headers: up })) as unknown as typeof fetch;
    const res = await proxyToWorker(new Request("https://shop.devstack.bid/"), W, "sub", { fetcher });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors https://devstack.bid");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("x-devstack-origin")).toBeNull();
    expect(await res.text()).toContain("data-devstack-badge");
  });
  it("ignores worker names that are not platform-issued site-*", async () => {
    for (const worker of ["nvx-stack-builder", "site-shop"]) {
      const res = await serveSite(new Request("https://shop.devstack.bid/", { method: "POST" }), bucket({ projectId: "p", deploymentId: "d1234567", worker }), "devstack.bid", { workersSubdomain: "sub", fetcher: (() => { throw new Error("no"); }) as never });
      expect(res.status).toBe(405);
    }
  });
  it("rewrites same-origin redirects to the public host", async () => {
    const fetcher = (async () => project(null, { status: 307, headers: { location: `https://${W}.sub.workers.dev/login` } })) as unknown as typeof fetch;
    const res = await proxyToWorker(new Request("https://shop.devstack.bid/"), W, "sub", fetcher);
    expect(res.headers.get("location")).toBe("https://shop.devstack.bid/login");
  });
  it("shows our unavailable page for workers.dev 404/5xx not from the project, but keeps the project's own 404", async () => {
    for (const status of [404, 500, 522]) {
      const res = await proxyToWorker(new Request("https://shop.devstack.bid/"), W, "sub", (async () => new Response("There is nothing here yet", { status })) as unknown as typeof fetch);
      expect(await res.text()).toContain("Site temporarily unavailable");
    }
    const own = await proxyToWorker(new Request("https://shop.devstack.bid/x"), W, "sub", (async () => project("my 404", { status: 404, headers: { "content-type": "text/plain" } })) as unknown as typeof fetch);
    expect(own.status).toBe(404);
    expect(await own.text()).toBe("my 404");
    const down = await proxyToWorker(new Request("https://shop.devstack.bid/"), W, "sub", (async () => { throw new Error("net"); }) as unknown as typeof fetch);
    expect(down.status).toBe(502);
  });
});

describe("proxy target is always the project worker host (N1 SSRF)", () => {
  const paths = ["//evil.com/x", "/\\evil.com/x", "/%2F%2Fevil.com/x", "//evil.com", "/%5Cevil.com", "///evil.com/x", "/@evil.com", "/..//evil.com"];
  for (const p of paths) {
    it(`keeps host for ${p}`, async () => {
      const seen: string[] = [];
      const fetcher = (async (u: string) => { seen.push(u); return new Response("ok", { headers: { "x-devstack-origin": "project" } }); }) as unknown as typeof fetch;
      const req = new Request("https://shop.devstack.bid/");
      Object.defineProperty(req, "url", { value: "https://shop.devstack.bid" + p });
      await proxyToWorker(req, W, "sub", { fetcher, proxyKey: "KEY" });
      for (const u of seen) expect(new URL(u).host).toBe(`${W}.sub.workers.dev`);
    });
  }
});

describe("preview worker cleanup", () => {
  const day = 86_400_000, now = Date.parse("2026-10-22T00:00:00Z");
  it("keeps newest 5 always, deletes only old + provably-owned previews, removes their aliases", async () => {
    const { serverWorkerName, cleanupPreviewWorkers } = await import("@/lib/hosting/server-worker");
    const P = await serverWorkerName("proj-A");
    const Q = await serverWorkerName("proj-B");
    const pv = (base: string, i: number) => `${base}-${i.toString(16).padStart(12, "0")}`;
    const scripts = [
      { id: P, ageDays: 400 }, { id: "nvx-stack-builder", ageDays: 400 }, { id: "site-e2e-next-1022", ageDays: 400 },
      ...Array.from({ length: 7 }, (_, i) => ({ id: pv(P, i), ageDays: 20 + i })), // all old: newest 5 kept, 2 deleted
      ...Array.from({ length: 7 }, (_, i) => ({ id: pv(Q, i), ageDays: i })),      // over cap but young: kept
    ];
    // pv(P,6) is tagged with another project's id → hash mismatch → never deleted.
    const tagFor = (n: string) => (n === pv(P, 6) ? "devstack-project-proj-B" : n.startsWith(P) ? "devstack-project-proj-A" : "devstack-project-proj-B");
    const deleted: string[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      const path = url.replace("https://api.cloudflare.com/client/v4/accounts/a", "");
      if (path === "/workers/scripts") return new Response(JSON.stringify({ success: true, result: scripts.map((x) => ({ id: x.id, modified_on: new Date(now - x.ageDays * day).toISOString() })) }));
      const name = path.split("/")[3].split("?")[0];
      if (path.endsWith("/script-settings")) return new Response(JSON.stringify({ success: true, result: { tags: [tagFor(name)] } }));
      if (init.method === "DELETE") { deleted.push(name); return new Response(JSON.stringify({ success: true, result: null })); }
      return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;
    const store = new Map<string, string>([
      [`workers/${pv(P, 5)}.json`, JSON.stringify({ labels: ["shop-aaaaaa", "shop"] })],
      ["hosts/shop-aaaaaa.json", JSON.stringify({ projectId: "proj-A", worker: pv(P, 5) })],
      ["hosts/shop.json", JSON.stringify({ projectId: "proj-A", worker: P })],
    ]);
    const bucket = { get: async (k: string) => (store.has(k) ? { text: async () => store.get(k)! } : null), put: async (k: string, v: string) => { store.set(k, v); }, delete: async (k: string) => { store.delete(k); } } as never;
    const out = await cleanupPreviewWorkers({ accountId: "a", token: "t", fetcher }, { now, bucket });
    expect(out).toEqual([pv(P, 5)]);
    expect(deleted).toEqual([pv(P, 5)]);
    expect(JSON.parse(store.get("hosts/shop-aaaaaa.json")!)).toMatchObject({ projectId: "proj-A", expired: true }); // tombstone → 410
    expect(store.has("hosts/shop.json")).toBe(true); // production alias points elsewhere → untouched
    expect(store.has(`workers/${pv(P, 5)}.json`)).toBe(false);
  });
});

describe("preview expired page", () => {
  it("a deleted preview worker shows 410 preview expired; production shows unavailable", async () => {
    const f = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    const pv = await proxyToWorker(new Request("https://shop-aaaaaa.devstack.bid/"), `${W}-aaaaaaaaaaaa`, "sub", f);
    expect(pv.status).toBe(410);
    expect(await pv.text()).toContain("preview has expired");
    expect(await (await proxyToWorker(new Request("https://shop.devstack.bid/"), W, "sub", f)).text()).toContain("temporarily unavailable");
  });
});

describe("badge via HTMLRewriter when available", () => {
  it("streams through HTMLRewriter (no res.text())", async () => {
    const used: string[] = [];
    class FakeRewriter { sel = ""; h: { element(e: { append(c: string, o: { html: boolean }): void }): void } | null = null; d: { end(e: { append(c: string, o: { html: boolean }): void }): void } | null = null;
      on(sel: string, h: FakeRewriter["h"]) { this.sel = sel; this.h = h; return this; }
      onDocument(d: FakeRewriter["d"]) { this.d = d; return this; }
      transform(r: Response) { let added = ""; this.h!.element({ append: (c) => { added += c; } }); this.d!.end({ append: (c) => { added += c; } }); used.push(this.sel); return new Response(`[rewritten:${(added.match(/data-devstack-badge/g) ?? []).length}]`, r); } }
    (globalThis as Record<string, unknown>).HTMLRewriter = FakeRewriter;
    try {
      const fetcher = (async () => new Response("<body>x</body>", { headers: { "x-devstack-origin": "project", "content-type": "text/html", "content-encoding": "gzip" } })) as unknown as typeof fetch;
      const res = await proxyToWorker(new Request("https://shop.devstack.bid/"), W, "sub", { fetcher });
      expect(await res.text()).toBe("[rewritten:1]"); // body found → no second badge at document end
      expect(res.headers.get("content-encoding")).toBeNull();
      expect(used).toEqual(["body"]);
    } finally { delete (globalThis as Record<string, unknown>).HTMLRewriter; }
  });
});

describe("badge at document end when there is no <body>", () => {
  it("uses onDocument end", async () => {
    let got = "";
    class R { on() { return this; } onDocument(d: { end(e: { append(c: string): void }): void }) { d.end({ append: (c) => { got = c; } }); return this; } transform(r: Response) { return r; } }
    (globalThis as Record<string, unknown>).HTMLRewriter = R;
    try {
      await proxyToWorker(new Request("https://shop.devstack.bid/"), W, "sub", (async () => new Response("<p>x", { headers: { "x-devstack-origin": "project", "content-type": "application/xhtml+xml" } })) as unknown as typeof fetch);
      expect(got).toContain("data-devstack-badge");
    } finally { delete (globalThis as Record<string, unknown>).HTMLRewriter; }
  });
});

describe("placeholder workers and extra modules", () => {
  it("claims an empty placeholder (no tags, no versions) but not a tag-less Worker with code", async () => {
    const mk = (items: unknown[]) => (async (url: string) => new Response(JSON.stringify({ success: true, result: url.endsWith("/versions") ? { items } : { tags: null } }))) as unknown as typeof fetch;
    expect(await checkOwnership({ accountId: "a", token: "t", fetcher: mk([]) }, W, "p")).toBe("new");
    await expect(checkOwnership({ accountId: "a", token: "t", fetcher: mk([{ id: "v" }]) }, W, "p")).rejects.toThrow("worker_owner_mismatch");
  });
  it("uploads sibling wasm modules from worker/, skips maps and unsafe names", async () => {
    const b = readServerBundle([
      { path: "server.json", bytes: enc("{}") }, { path: "worker/worker.js", bytes: enc("x") },
      { path: "worker/abc-yoga.wasm", bytes: new Uint8Array([0, 97, 115, 109]) }, { path: "worker/worker.js.map", bytes: enc("{}") },
      { path: "worker/devstack-guard.js", bytes: enc("evil") }, { path: "worker/sub/x.wasm", bytes: enc("x") }, { path: "worker/README.md", bytes: enc("r") },
    ])!;
    expect(b.modules?.map((m) => [m.name, m.type])).toEqual([["abc-yoga.wasm", "application/wasm"]]);
  });
});

describe("expired previews and worker naming", () => {
  it("cleanup → same host answers 410 preview expired (Thai/English by Accept-Language)", async () => {
    const { serverWorkerName, cleanupPreviewWorkers } = await import("@/lib/hosting/server-worker");
    const { serveSite } = await import("@/lib/hosting/serve");
    const now = Date.parse("2026-10-22T00:00:00Z");
    const P = await serverWorkerName("proj-A");
    const pvs = Array.from({ length: 6 }, (_, i) => `${P}-${i.toString(16).padStart(12, "0")}`);
    const fetcher = (async (url: string, init: RequestInit) => {
      const path = url.replace("https://api.cloudflare.com/client/v4/accounts/a", "");
      if (path === "/workers/scripts") return new Response(JSON.stringify({ success: true, result: pvs.map((id, i) => ({ id, modified_on: new Date(now - (30 + i) * 86_400_000).toISOString() })) }));
      if (path.endsWith("/script-settings")) return new Response(JSON.stringify({ success: true, result: { tags: ["devstack-project-proj-A"] } }));
      if (init.method === "DELETE") return new Response(JSON.stringify({ success: true, result: null }));
      return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;
    const oldest = pvs[5];
    const store = new Map<string, string>([
      [`workers/${oldest}.json`, JSON.stringify({ labels: ["shop-zzzzzz"] })],
      ["hosts/shop-zzzzzz.json", JSON.stringify({ projectId: "proj-A", deploymentId: "dep-00000001", worker: oldest })],
    ]);
    const bucket = { get: async (k: string) => (store.has(k) ? { text: async () => store.get(k)!, body: new Response(store.get(k)!).body! } : null), put: async (k: string, v: string) => { store.set(k, v); }, delete: async (k: string) => { store.delete(k); } } as never;
    expect(await cleanupPreviewWorkers({ accountId: "a", token: "t", fetcher }, { now, bucket })).toEqual([oldest]);
    const th = await serveSite(new Request("https://shop-zzzzzz.devstack.bid/", { headers: { "accept-language": "th-TH,th;q=0.9" } }), bucket, "devstack.bid", { workersSubdomain: "examplessdk", fetcher });
    expect(th.status).toBe(410);
    const thText = await th.text();
    expect(thText).toContain("พรีวิวนี้หมดอายุแล้ว");
    expect(thText).not.toContain("This preview has expired");
    const en = await serveSite(new Request("https://shop-zzzzzz.devstack.bid/", { headers: { "accept-language": "en-US,en;q=0.9" } }), bucket, "devstack.bid");
    expect(en.status).toBe(410);
    expect(await en.text()).toContain("This preview has expired");
    const both = await (await serveSite(new Request("https://shop-zzzzzz.devstack.bid/"), bucket, "devstack.bid")).text();
    expect(both).toContain("พรีวิวนี้หมดอายุแล้ว");
    expect(both).toContain("This preview has expired");
  });

  it("cleanup's project hash is exactly the prefix used to name the Worker", async () => {
    const { serverWorkerName, projectHash } = await import("@/lib/hosting/server-worker");
    for (const pid of ["proj-A", "0f3c9e1a-1111-4222-8333-444455556666"]) {
      const h = await projectHash(pid);
      expect(h).toMatch(/^[a-f0-9]{20}$/);
      expect(await serverWorkerName(pid)).toBe(`site-${h}`);
      expect((await serverWorkerName(pid, "dep-12345678")).startsWith(`site-${h}-`)).toBe(true);
      const { createHash } = await import("node:crypto");
      expect(h).toBe(createHash("sha256").update(`project:${pid}`).digest("hex").slice(0, 20));
    }
  });
});

describe("pickLanguage / previewExpired", () => {
  it("picks one language by highest q (first on tie); both only when the header is missing", async () => {
    const { pickLanguage, previewExpired } = await import("@/lib/hosting/serve");
    expect(pickLanguage("th-TH,th;q=0.9,en;q=0.8")).toBe("th");
    expect(pickLanguage("en-US,th;q=0.9")).toBe("en");
    expect(pickLanguage("th;q=0.5,en;q=0.9")).toBe("en");
    expect(pickLanguage("en;q=0.7,th;q=0.7")).toBe("en");
    expect(pickLanguage("fr-FR")).toBe("en");
    expect(pickLanguage("th;q=0,en")).toBe("en");
    expect(pickLanguage(null)).toBe("both");
    expect(pickLanguage("")).toBe("both");
    const mixed = await previewExpired("en-US,th;q=0.9").text();
    expect(mixed).toContain("This preview has expired");
    expect(mixed).not.toContain("พรีวิวนี้หมดอายุแล้ว");
  });
});

