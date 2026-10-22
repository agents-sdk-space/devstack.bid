import { describe, expect, it } from "vitest";
import { parseHost, previewHost, productionHost, shortId, siteSlug } from "@/lib/hosting/hostnames";
import { objectPath, serveSite, type R2BucketLike } from "@/lib/hosting/serve";
import { HostTakenError, promoteProduction, publishPreview, writeSite } from "@/lib/hosting/publish";

function memBucket(): R2BucketLike & { keys: () => string[] } {
  const m = new Map<string, { bytes: Uint8Array; type?: string }>();
  return {
    keys: () => [...m.keys()],
    async get(key) {
      const v = m.get(key);
      if (!v) return null;
      return { body: new Response(v.bytes as BlobPart).body!, httpEtag: `"${key.length}-${v.bytes.length}"`, httpMetadata: { contentType: v.type }, text: async () => new TextDecoder().decode(v.bytes) };
    },
    async put(key, value, opts) {
      const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
      m.set(key, { bytes, type: opts?.httpMetadata?.contentType });
    },
  };
}
const enc = (s: string) => new TextEncoder().encode(s);
const DEP = "0f3a9c2e-1111-4222-8333-944455556666";

describe("site hostnames", () => {
  it("makes Vercel-style production and preview hosts", () => {
    expect(siteSlug("My Cool App!")).toBe("my-cool-app");
    expect(siteSlug("--x--")).toBe("x");
    expect(siteSlug("www")).toBeNull();
    expect(siteSlug("xn--abc")).toBe("xn-abc"); // punycode prefix cannot survive
    expect(siteSlug("a".repeat(100))!.length).toBeLessThanOrEqual(56);
    expect(productionHost("my-app")).toBe("my-app.devstack.bid");
    const p = previewHost("my-app", DEP);
    expect(p).toMatch(/^my-app-[a-z0-9]{6}\.devstack\.bid$/);
    expect(shortId(DEP)).toBe(shortId(DEP));
    expect(() => productionHost("api")).toThrow();
  });

  it("keeps the apex and reserved labels on the platform", () => {
    expect(parseHost("devstack.bid")).toEqual({ kind: "platform" });
    expect(parseHost("www.devstack.bid")).toEqual({ kind: "platform" });
    expect(parseHost("my-app.devstack.bid")).toEqual({ kind: "site", label: "my-app" });
    expect(parseHost("MY-APP.devstack.bid.")).toEqual({ kind: "site", label: "my-app" });
    expect(parseHost("a.b.devstack.bid")).toEqual({ kind: "foreign" });
    expect(parseHost("evil-devstack.bid")).toEqual({ kind: "foreign" });
    expect(parseHost("devstack.bid.evil.com")).toEqual({ kind: "foreign" });
  });

  it("rejects traversal and hidden files", () => {
    expect(objectPath("/a/b.css")).toBe("a/b.css");
    expect(objectPath("/../x")).toBeNull();
    expect(objectPath("/%2e%2e/x")).toBeNull();
    expect(objectPath("/.env")).toBeNull();
    expect(objectPath("/%ZZ")).toBeNull();
  });
});

describe("site router", () => {
  it("serves preview and promoted production, with clean URLs and 404", async () => {
    const b = memBucket();
    await writeSite(b, DEP, [{ path: "index.html", bytes: enc("<h1>hi</h1>") }, { path: "about.html", bytes: enc("about") }, { path: "assets/app.js", bytes: enc("x") }, { path: "404.html", bytes: enc("nope") }]);
    const preview = await publishPreview(b, "my-app", "proj-1", DEP);
    const prod = await promoteProduction(b, "my-app", "proj-1", DEP);
    expect(prod).toBe("https://my-app.devstack.bid");
    for (const base of [preview, prod]) {
      const r = await serveSite(new Request(`${base}/`), b);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toMatch(/text\/html/);
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("set-cookie")).toBeNull();
      expect(await r.text()).toMatch(/^<h1>hi<\/h1>/);
    }
    expect(await (await serveSite(new Request(`${prod}/about`), b)).text()).toMatch(/^about<a /);
    expect((await serveSite(new Request(`${prod}/assets/app.js`), b)).headers.get("cache-control")).toMatch(/immutable/);
    const nf = await serveSite(new Request(`${prod}/missing`), b);
    expect(nf.status).toBe(404);
    expect(await nf.text()).toMatch(/^nope<a /);
    expect((await serveSite(new Request("https://other.devstack.bid/"), b)).status).toBe(404);
    expect((await serveSite(new Request("https://devstack.bid/"), b)).status).toBe(404);
    expect((await serveSite(new Request(`${prod}/`, { method: "POST" }), b)).status).toBe(405);
  });

  it("a hostname belongs to the first project that claims it", async () => {
    const b = memBucket();
    await promoteProduction(b, "taken", "proj-a", DEP);
    await expect(promoteProduction(b, "taken", "proj-b", DEP)).rejects.toBeInstanceOf(HostTakenError);
    await expect(promoteProduction(b, "taken", "proj-a", DEP)).resolves.toBe("https://taken.devstack.bid");
  });
});
