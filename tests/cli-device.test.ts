import { describe, expect, it } from "vitest";
import { sqliteD1 } from "./helpers/sqlite-d1";
import { cleanupDeviceCodes, coarseIp, createDeviceCode, decideDeviceCode, DeviceError, DEVICE_TTL_MS, KEY_TTL_MS, lookupDeviceCode, MAX_ACTIVE_KEYS, MAX_PENDING_CODES, normalizeUserCode, pollDeviceCode, randomUserCode, revokeClient } from "@/lib/cli/device";
import { authenticateMcpClient, hashMcpKey, isCliKey, isMcpKey, MCP_SCOPES, mintMcpKey } from "@/lib/mcp/auth";
import { needScope } from "@/lib/mcp/server";

function seedUser(db: ReturnType<typeof sqliteD1>, id = "u1") {
  const cols = (db.raw.prepare("PRAGMA table_info(users)").all() as { name: string; notnull: number; dflt_value: unknown; pk: number }[]);
  const req = cols.filter((c) => c.notnull && c.dflt_value === null && !c.pk).map((c) => c.name);
  const names = ["id", ...req];
  db.raw.prepare(`INSERT INTO users (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(id, ...req.map((n) => `${n}-${id}`));
  return id;
}

describe("CLI device-code login", () => {
  it("adds the cli:deploy scope", () => expect(MCP_SCOPES).toContain("cli:deploy"));

  it("stores only a hash, coarse IP + country, and normalizes user codes", async () => {
    const db = sqliteD1();
    const d = await createDeviceCode(db, "devstack CLI (mac)", { ip: coarseIp("203.0.113.77"), country: "th" });
    expect(d.deviceCode).toMatch(/^dvc_[A-Za-z0-9_-]{43}$/);
    expect(d).not.toHaveProperty("verificationUriComplete");
    const row = db.raw.prepare("SELECT * FROM cli_device_codes").get() as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain(d.deviceCode);
    expect(row.device_hash).toBe(await hashMcpKey(d.deviceCode));
    expect(row.requested_ip).toBe("203.0.113.x");
    expect(row.requested_country).toBe("TH");
    expect(normalizeUserCode(d.userCode.toLowerCase().replace("-", ""))).toBe(d.userCode);
    expect(normalizeUserCode("AAAA-AAAA")).toBeNull();
    expect((await lookupDeviceCode(db, d.userCode))?.clientName).toBe("devstack CLI (mac)");
  });

  it("user codes use rejection sampling (bytes >= 252 are discarded)", () => {
    let call = 0;
    const code = randomUserCode((n) => (call++ === 0 ? new Uint8Array(n).fill(255) : new Uint8Array(n).fill(28)));
    expect(code).toBe("BBBB-BBBB"); // 255 rejected; 28 % 28 = 0 -> "B"
    expect(call).toBe(2);
  });

  it("retries on a user_code collision", async () => {
    const db = sqliteD1();
    await createDeviceCode(db, "a", {}, Date.now(), () => "BCDF-GHJK");
    const codes = ["BCDF-GHJK", "BCDF-GHJK", "LMNP-QRST"];
    const d = await createDeviceCode(db, "b", {}, Date.now(), () => codes.shift()!);
    expect(d.userCode).toBe("LMNP-QRST");
  });

  it("caps pending codes and cleans up expired ones", async () => {
    const db = sqliteD1();
    const now = Date.now();
    const ins = db.raw.prepare("INSERT INTO cli_device_codes (device_hash, user_code, client_name, expires_at) VALUES (?, ?, 'x', ?)");
    db.raw.exec("BEGIN");
    for (let i = 0; i < MAX_PENDING_CODES; i++) ins.run(`h${i}`, `c${i}`, now + 60_000);
    db.raw.exec("COMMIT");
    await expect(createDeviceCode(db, "x", {}, now)).rejects.toBeInstanceOf(DeviceError);
    db.raw.exec("UPDATE cli_device_codes SET expires_at = 1 WHERE device_hash = 'h0'");
    await cleanupDeviceCodes(db, now);
    expect(await createDeviceCode(db, "x", {}, now)).toHaveProperty("userCode");
  });

  it("approve is atomic, deploy is opt-in, key is scoped, hashed, single use, expiring and revocable", async () => {
    const db = sqliteD1();
    const uid = seedUser(db);
    const d = await createDeviceCode(db, "cli");
    expect((await pollDeviceCode(db, d.deviceCode)).status).toBe("pending");
    expect((await pollDeviceCode(db, d.deviceCode)).status).toBe("slow_down");
    expect(await decideDeviceCode(db, uid, d.userCode, true)).toEqual({ ok: true, clientName: "cli", scopes: ["cli:setup"] });
    expect((await decideDeviceCode(db, uid, d.userCode, true)).ok).toBe(false); // already decided: no row changed
    const r = await pollDeviceCode(db, d.deviceCode);
    expect(r.status).toBe("approved");
    if (r.status !== "approved") return;
    const client = db.raw.prepare("SELECT key_hash, scopes, expires_at FROM api_clients WHERE id = ?").get(r.clientId) as { key_hash: string; scopes: string; expires_at: number };
    expect(client.key_hash).toBe(await hashMcpKey(r.token));
    expect(JSON.parse(client.scopes)).toEqual(["cli:setup"]);
    expect(client.expires_at).toBeGreaterThan(Date.now() + KEY_TTL_MS - 60_000);
    expect((await pollDeviceCode(db, d.deviceCode)).status).toBe("invalid");
    const req = new Request("https://devstack.bid/api/cli/whoami", { headers: { Authorization: `Bearer ${r.token}` } });
    expect((await authenticateMcpClient(req, db)).client?.userId).toBe(uid);
    expect(await revokeClient(db, uid, r.clientId)).toBe(true);
    expect((await authenticateMcpClient(req, db)).client).toBeNull();

    const e = await createDeviceCode(db, "cli2");
    expect((await decideDeviceCode(db, uid, e.userCode, true, { deploy: true })).ok).toBe(true);
    await new Promise((res) => setTimeout(res, 0));
    const r2 = await pollDeviceCode(db, e.deviceCode, Date.now() + 10_000);
    expect(r2.status === "approved" && r2.scopes).toEqual(["cli:setup", "cli:deploy"]);
  });

  it("expiry slides on use and last_used_at is recorded; expired keys are rejected", async () => {
    const db = sqliteD1();
    const uid = seedUser(db);
    const d = await createDeviceCode(db, "cli");
    await decideDeviceCode(db, uid, d.userCode, true);
    const r = await pollDeviceCode(db, d.deviceCode);
    if (r.status !== "approved") throw new Error("not approved");
    const req = new Request("https://x/", { headers: { Authorization: `Bearer ${r.token}` } });
    const later = Date.now() + 30 * 86_400_000;
    await authenticateMcpClient(req, db, later);
    const row = db.raw.prepare("SELECT expires_at, last_used_at FROM api_clients WHERE id = ?").get(r.clientId) as { expires_at: number; last_used_at: number };
    expect(row.last_used_at).toBe(later);
    expect(row.expires_at).toBe(later + KEY_TTL_MS);
    expect((await authenticateMcpClient(req, db, later + KEY_TTL_MS + 1)).client).toBeNull();
  });

  it("denied, expired and unknown codes never mint", async () => {
    const db = sqliteD1();
    const uid = seedUser(db);
    const d = await createDeviceCode(db, "cli");
    await decideDeviceCode(db, uid, d.userCode, false);
    expect((await pollDeviceCode(db, d.deviceCode)).status).toBe("denied");
    const e = await createDeviceCode(db, "cli", {}, Date.now() - DEVICE_TTL_MS - 1);
    expect((await decideDeviceCode(db, uid, e.userCode, true)).ok).toBe(false);
    expect((await pollDeviceCode(db, e.deviceCode)).status).toBe("expired");
    expect((await pollDeviceCode(db, "dvc_" + "x".repeat(43))).status).toBe("invalid");
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM api_clients").get()).toEqual({ n: 0 });
  });

  it("enforces the key cap at approve time and before consuming the code", async () => {
    const db = sqliteD1();
    const uid = seedUser(db);
    const d = await createDeviceCode(db, "cli");
    await decideDeviceCode(db, uid, d.userCode, true);
    for (let i = 0; i < MAX_ACTIVE_KEYS; i++) db.raw.prepare("INSERT INTO api_clients (id, user_id, name, key_hash) VALUES (?, ?, 'k', ?)").run(`k${i}`, uid, `h${i}`);
    const e = await createDeviceCode(db, "cli");
    expect(await decideDeviceCode(db, uid, e.userCode, true)).toEqual({ ok: false, code: "key_limit" });
    expect((await pollDeviceCode(db, d.deviceCode)).status).toBe("key_limit");
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM cli_device_codes WHERE status = 'approved'").get()).toEqual({ n: 1 }); // not consumed
  });
});

describe("CLI and MCP keys are separate", () => {
  async function key(db: ReturnType<typeof sqliteD1>, uid: string, scopes: string[]) {
    const k = await mintMcpKey();
    db.raw.prepare("INSERT INTO api_clients (id, user_id, name, key_hash, scopes) VALUES (?, ?, 'k', ?, ?)").run(crypto.randomUUID(), uid, await hashMcpKey(k), JSON.stringify(scopes));
    return new Request("https://devstack.bid/mcp", { headers: { Authorization: `Bearer ${k}` } });
  }
  it("classifies keys", () => {
    expect(isCliKey(["cli:setup", "cli:deploy"])).toBe(true);
    expect(isMcpKey(["cli:setup"])).toBe(false);
    expect(isMcpKey(["plan:write"])).toBe(true);
    expect(isCliKey(["plan:write", "cli:setup"]) || isMcpKey(["plan:write", "cli:setup"])).toBe(false);
  });
  it("a CLI key cannot call MCP tools; an MCP key can", async () => {
    const db = sqliteD1();
    const uid = seedUser(db);
    await expect(needScope(await key(db, uid, ["cli:setup", "cli:deploy"]), "cli:setup", db)).rejects.toMatchObject({ status: 403 });
    await expect(needScope(await key(db, uid, ["plan:write"]), "plan:write", db)).resolves.toMatchObject({ userId: uid });
  });
  it("an MCP key cannot use CLI routes", async () => {
    const src = (await import("node:fs")).readFileSync("src/lib/cli/auth.ts", "utf8") + (await import("node:fs")).readFileSync("src/lib/connections/route-kit.ts", "utf8");
    expect(src.match(/isCliKey\(client\.scopes\)/g)?.length).toBe(2);
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
