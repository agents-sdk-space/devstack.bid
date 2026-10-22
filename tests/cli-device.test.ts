import { describe, expect, it } from "vitest";
import { sqliteD1 } from "./helpers/sqlite-d1";
import { createDeviceCode, decideDeviceCode, DEVICE_TTL_MS, normalizeUserCode, pollDeviceCode, revokeClient, MAX_ACTIVE_KEYS } from "@/lib/cli/device";
import { authenticateMcpClient, hashMcpKey, MCP_SCOPES } from "@/lib/mcp/auth";

function seedUser(db: ReturnType<typeof sqliteD1>, id = "u1") {
  const cols = (db.raw.prepare("PRAGMA table_info(users)").all() as { name: string; notnull: number; dflt_value: unknown; pk: number }[]);
  const req = cols.filter((c) => c.notnull && c.dflt_value === null && !c.pk).map((c) => c.name);
  const names = ["id", ...req];
  db.raw.prepare(`INSERT INTO users (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(id, ...req.map((n) => `${n}-${id}`));
  return id;
}

describe("CLI device-code login", () => {
  it("adds the cli:deploy scope", () => expect(MCP_SCOPES).toContain("cli:deploy"));

  it("stores only a hash of the device code and normalizes user codes", async () => {
    const db = sqliteD1();
    const d = await createDeviceCode(db, "devstack CLI (mac)");
    expect(d.deviceCode).toMatch(/^dvc_[A-Za-z0-9_-]{43}$/);
    expect(d.expiresIn).toBe(600);
    const row = db.raw.prepare("SELECT * FROM cli_device_codes").get() as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain(d.deviceCode);
    expect(row.device_hash).toBe(await hashMcpKey(d.deviceCode));
    expect(normalizeUserCode(d.userCode.toLowerCase().replace("-", ""))).toBe(d.userCode);
    expect(normalizeUserCode("AAAA-AAAA")).toBeNull();
  });

  it("pending → approved mints a scoped, hashed, single-use, revocable key", async () => {
    const db = sqliteD1();
    const uid = seedUser(db);
    const d = await createDeviceCode(db, "cli");
    expect((await pollDeviceCode(db, d.deviceCode)).status).toBe("pending");
    expect((await pollDeviceCode(db, d.deviceCode)).status).toBe("slow_down");
    expect((await decideDeviceCode(db, uid, d.userCode, true)).ok).toBe(true);
    const r = await pollDeviceCode(db, d.deviceCode);
    expect(r.status).toBe("approved");
    if (r.status !== "approved") return;
    expect(r.token).toMatch(/^nvx_live_/);
    const client = db.raw.prepare("SELECT key_hash, scopes FROM api_clients WHERE id = ?").get(r.clientId) as { key_hash: string; scopes: string };
    expect(client.key_hash).toBe(await hashMcpKey(r.token));
    expect(JSON.parse(client.scopes)).toEqual(["cli:setup", "cli:deploy"]);
    expect((await pollDeviceCode(db, d.deviceCode)).status).toBe("invalid"); // single use
    const req = new Request("https://devstack.bid/api/cli/whoami", { headers: { Authorization: `Bearer ${r.token}` } });
    expect((await authenticateMcpClient(req, db)).client?.userId).toBe(uid);
    expect(await revokeClient(db, uid, r.clientId)).toBe(true);
    expect((await authenticateMcpClient(req, db)).client).toBeNull();
    expect(await revokeClient(db, uid, r.clientId)).toBe(false);
  });

  it("denied, expired and unknown codes never mint", async () => {
    const db = sqliteD1();
    const uid = seedUser(db);
    const d = await createDeviceCode(db, "cli");
    await decideDeviceCode(db, uid, d.userCode, false);
    expect((await pollDeviceCode(db, d.deviceCode)).status).toBe("denied");
    const e = await createDeviceCode(db, "cli", Date.now() - DEVICE_TTL_MS - 1);
    expect((await decideDeviceCode(db, uid, e.userCode, true)).ok).toBe(false);
    expect((await pollDeviceCode(db, e.deviceCode)).status).toBe("expired");
    expect((await pollDeviceCode(db, "dvc_" + "x".repeat(43))).status).toBe("invalid");
    expect((await pollDeviceCode(db, "garbage")).status).toBe("invalid");
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM api_clients").get()).toEqual({ n: 0 });
  });

  it("enforces the active key cap", async () => {
    const db = sqliteD1();
    const uid = seedUser(db);
    for (let i = 0; i < MAX_ACTIVE_KEYS; i++) db.raw.prepare("INSERT INTO api_clients (id, user_id, name, key_hash) VALUES (?, ?, 'k', ?)").run(`k${i}`, uid, `h${i}`);
    const d = await createDeviceCode(db, "cli");
    await decideDeviceCode(db, uid, d.userCode, true);
    expect((await pollDeviceCode(db, d.deviceCode)).status).toBe("key_limit");
  });
});

describe("bearer (CLI) access is opt-in per route", () => {
  it("only build/import/list/status routes accept CLI bearer keys", async () => {
    const { readFileSync } = await import("node:fs");
    const { execSync } = await import("node:child_process");
    const files = execSync("grep -rl 'bearer: true' src/app/api", { encoding: "utf8" }).trim().split("\n").sort();
    expect(files).toEqual([
      "src/app/api/deployments/[id]/logs/route.ts",
      "src/app/api/deployments/[id]/route.ts",
      "src/app/api/projects/[id]/builds/route.ts",
      "src/app/api/projects/[id]/deploy/route.ts",
      "src/app/api/projects/import/route.ts",
      "src/app/api/projects/route.ts",
    ]);
    // Direct deploy POST (accepts Cloudflare tokens) stays cookie + same-origin only.
    expect(readFileSync("src/app/api/projects/[id]/deploy/route.ts", "utf8")).toMatch(/burstKey: "dep-new", perMinute: 4 \}/);
  });
});
