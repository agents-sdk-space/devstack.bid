import { describe, expect, it } from "vitest";
import { normalizeHostname, resolveCustomDomain, toState, createHostname, type SaasApi } from "@/lib/hosting/custom-domains";
import { serveSite, type R2BucketLike } from "@/lib/hosting/serve";
import { addDomain, verifyDomain, removeDomain } from "@/lib/hosting/domain-service";

function bucket(init: Record<string, string> = {}): R2BucketLike & { store: Map<string, string> } {
  const store = new Map(Object.entries(init));
  return {
    store,
    async get(k) { const v = store.get(k); if (v === undefined) return null; return { body: new Response(v).body!, text: async () => v, httpMetadata: {} }; },
    async put(k, v) { store.set(k, typeof v === "string" ? v : new TextDecoder().decode(v as Uint8Array)); },
    async delete(k) { store.delete(k); },
  };
}

describe("normalizeHostname", () => {
  it("accepts user domains", () => {
    expect(normalizeHostname("AiBotQ.dev")).toBe("aibotq.dev");
    expect(normalizeHostname("https://www.example.com/x")).toBe("www.example.com");
  });
  it("rejects platform, IPs, look-alikes", () => {
    for (const h of ["devstack.bid", "x.devstack.bid", "localhost", "1.2.3.4", "a.workers.dev", "devstack-login.com", "ex ample.com", "a.com:8080"]) expect(normalizeHostname(h)).toBeNull();
  });
});

describe("router", () => {
  it("serves a mapped custom domain from the project's deployment", async () => {
    const b = bucket({ "domains/aibotq.dev.json": JSON.stringify({ label: "aibotq" }), "hosts/aibotq.json": JSON.stringify({ deploymentId: "dep-12345678" }), "sites/dep-12345678/index.html": "<html><body>hi</body></html>" });
    const res = await serveSite(new Request("https://aibotq.dev/"), b, "devstack.bid");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("hi");
  });
  it("unmapped foreign host is unknown", async () => {
    const res = await serveSite(new Request("https://other.dev/"), bucket(), "devstack.bid");
    expect(res.status).toBe(404);
    expect(await resolveCustomDomain(bucket({ "domains/x.dev.json": "{\"label\":\"../a\"}" }), "x.dev")).toBeNull();
  });
});

function fakeCf(state: { status: string; ssl: string }) {
  const calls: string[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const result = { id: "abcd1234-0000", hostname: "aibotq.dev", status: state.status, ownership_verification: { type: "txt", name: "_cf-custom-hostname.aibotq.dev", value: "tok" }, ssl: { status: state.ssl, validation_records: [{ txt_name: "_acme-challenge.aibotq.dev", txt_value: "v" }] } };
    return Response.json({ success: true, result });
  }) as unknown as typeof fetch;
  const api: SaasApi = { zoneId: "a".repeat(32), token: "t".repeat(40), cnameTarget: "sites.devstack.bid", fetcher };
  return { api, calls };
}

function fakeDb() {
  const rows: Record<string, unknown>[] = [];
  const prepare = (sql: string) => ({
    bind: (...a: unknown[]) => ({
      async first() {
        if (sql.startsWith("SELECT project_id")) return rows.find((r) => r.hostname === a[0]) ?? null;
        if (sql.startsWith("SELECT COUNT")) return { n: rows.filter((r) => r.project_id === a[0]).length };
        if (sql.startsWith("SELECT *")) return rows.find((r) => r.id === a[0] && r.project_id === a[1]) ?? null;
        return null;
      },
      async run() {
        if (sql.startsWith("INSERT")) rows.push({ id: a[0], project_id: a[1], user_id: a[2], hostname: a[3], cf_hostname_id: a[4], status: a[5], ssl_status: a[6], verification: a[7] });
        if (sql.startsWith("UPDATE")) Object.assign(rows.find((r) => r.id === a[4])!, { status: a[0], ssl_status: a[1] });
        if (sql.startsWith("DELETE")) rows.splice(rows.findIndex((r) => r.id === a[0]), 1);
        return {};
      },
      async all() { return { results: rows }; },
    }),
  });
  return { rows, db: { prepare } as never };
}

describe("domain lifecycle", () => {
  const project = { id: "proj-12345678", user_id: "u1", name: "aibotq", slug: "aibotq", template_id: null, repo_full_name: null, default_branch: null, created_at: 0 };
  it("add → pending with CNAME + TXT records, no mapping; verify active → mapped; remove → unmapped", async () => {
    const st = { status: "pending", ssl: "pending_validation" };
    const { api, calls } = fakeCf(st);
    const { db } = fakeDb();
    const b = bucket();
    const add = await addDomain(db, api, project, "aibotq.dev");
    expect(add.ok).toBe(true);
    if (!add.ok) return;
    expect(add.value.records.map((r) => r.type)).toEqual(["CNAME", "TXT", "TXT"]);
    expect(add.value.live).toBe(false);
    expect((await addDomain(db, api, project, "aibotq.dev")).ok).toBe(false);
    let v = await verifyDomain(db, api, b, project, add.value.id);
    expect(v.ok && v.value.live).toBe(false);
    expect(b.store.has("domains/aibotq.dev.json")).toBe(false);
    st.status = "active"; st.ssl = "active";
    v = await verifyDomain(db, api, b, project, add.value.id);
    expect(v.ok && v.value.live).toBe(true);
    expect(JSON.parse(b.store.get("domains/aibotq.dev.json")!)).toEqual({ label: "aibotq" });
    expect((await removeDomain(db, api, b, project, add.value.id)).ok).toBe(true);
    expect(b.store.has("domains/aibotq.dev.json")).toBe(false);
    expect(calls.some((c) => c.startsWith("DELETE"))).toBe(true);
  });
  it("cloudflare failure surfaces as error, never success", async () => {
    const api: SaasApi = { zoneId: "a".repeat(32), token: "t".repeat(40), cnameTarget: "sites.devstack.bid", fetcher: (async () => Response.json({ success: false, errors: [{ code: 1405 }] }, { status: 403 })) as unknown as typeof fetch };
    await expect(createHostname(api, "aibotq.dev")).rejects.toThrow("cf_saas_403_1405");
    const r = await addDomain(fakeDb().db, api, project, "aibotq.dev");
    expect(r.ok).toBe(false);
  });
  it("toState hides records once active", () => {
    expect(toState({ cnameTarget: "sites.devstack.bid" }, { id: "x", hostname: "a.dev", status: "active", ssl: { status: "active" } }).records).toHaveLength(1);
  });
});
