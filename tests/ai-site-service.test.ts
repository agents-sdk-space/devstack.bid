// AI site builder service against real SQLite with every migration (incl. 0016) applied.
import { describe, expect, it } from "vitest";
import { sqliteD1 } from "./helpers/sqlite-d1";
import type { R2BucketLike } from "@/lib/hosting/serve";
import { serveSite } from "@/lib/hosting/serve";
import { addMessage, aiTurnsToday, createAiProject, filesOf, latestVersion, nextFiles, projectState, promoteVersion, publishVersion, saveVersion } from "@/lib/aisite/service";

function memBucket(): R2BucketLike & { keys: () => string[] } {
  const m = new Map<string, Uint8Array>();
  return {
    keys: () => [...m.keys()],
    async get(k) { const v = m.get(k); return v ? { body: new Response(v as BlobPart).body!, text: async () => new TextDecoder().decode(v) } : null; },
    async put(k, v) { m.set(k, typeof v === "string" ? new TextEncoder().encode(v) : (v as Uint8Array)); },
  };
}

async function setup() {
  const db = sqliteD1();
  db.raw.exec("INSERT INTO users (id) VALUES ('u1'), ('u2')");
  const p = await createAiProject(db, "u1", "Bean House");
  return { db, p };
}

describe("ai site service", () => {
  it("versions snapshots, publishes static output and serves it only on the site host", async () => {
    const { db, p } = await setup();
    expect(p.slug).toBe("bean-house");
    const v1 = await saveVersion(db, { projectId: p.id, uid: "u1", files: nextFiles([], { summary: "s", write: [{ path: "index.html", content: "<h1>v1</h1>" }] }), kind: "ai", prompt: "cafe", summary: "s", model: "m", parent: null });
    expect(v1.version).toBe(1);
    const sites = memBucket();
    const r = await publishVersion(db, { sites, dnsReady: true }, "u1", p, v1);
    expect(r.status).toBe("live");
    if (r.status !== "live") return;
    expect(r.url).toMatch(/^https:\/\/bean-house-[a-z0-9]{6}\.devstack\.bid$/);
    const res = await serveSite(new Request(`${r.url}/`), sites);
    expect(await res.text()).toBe("<h1>v1</h1>");
    expect((await serveSite(new Request("https://devstack.bid/"), sites)).status).toBe(404);
    const job = db.raw.prepare("SELECT status, executor FROM build_jobs WHERE id = ?").get(r.jobId) as { status: string; executor: string };
    expect(job).toEqual({ status: "succeeded", executor: "direct" });

    const v2 = await saveVersion(db, { projectId: p.id, uid: "u1", files: nextFiles(filesOf(v1), { summary: "x", replace: [{ path: "index.html", find: "v1", with: "v2" }] }), kind: "ai", prompt: "edit", summary: "x", model: "m", parent: 1 });
    expect(filesOf(v2)[0].content).toBe("<h1>v2</h1>");
    expect((await latestVersion(db, p.id))!.version).toBe(2);
    const promoted = await promoteVersion(db, { sites, dnsReady: true }, "u1", p, 1);
    expect(promoted.url).toBe("https://bean-house.devstack.bid");
    expect(await (await serveSite(new Request("https://bean-house.devstack.bid/"), sites)).text()).toBe("<h1>v1</h1>");

    const s = await projectState(db, "u1", p.id);
    expect(s.versions.map((v) => (v as { version: number }).version)).toEqual([2, 1]);
    await expect(projectState(db, "u2", p.id)).rejects.toThrow(/Not found/);
  });

  it("reports Blocked honestly when SITES or DNS is missing", async () => {
    const { db, p } = await setup();
    const v = await saveVersion(db, { projectId: p.id, uid: "u1", files: [{ path: "index.html", content: "x" }], kind: "ai", prompt: null, summary: null, model: null, parent: null });
    expect(await publishVersion(db, { sites: null, dnsReady: true }, "u1", p, v)).toMatchObject({ status: "blocked" });
    expect((await publishVersion(db, { sites: memBucket(), dnsReady: false }, "u1", p, v)).status).toBe("published_dns_blocked");
  });

  it("rejects unsafe model output and counts daily turns", async () => {
    const { db, p } = await setup();
    expect(() => nextFiles([], { summary: "", write: [{ path: "../../etc/passwd.txt", content: "" }] })).toThrow(/rejected/);
    await addMessage(db, { projectId: p.id, uid: "u1", role: "user", content: "a" });
    await addMessage(db, { projectId: p.id, uid: "u1", role: "assistant", content: "b" });
    expect(await aiTurnsToday(db, "u1")).toBe(1);
  });
});
