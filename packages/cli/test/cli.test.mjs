import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { run, parseArgs } from "../dist/cli.js";
import { readZip, extractZip } from "../dist/unzip.js";
import { apiBase, readAuth } from "../dist/config.js";
import { redact } from "../dist/api.js";

const TOKEN = "nvx_live_" + "A".repeat(43);
const DEVICE = "dvc_" + "b".repeat(43);

function harness(routes, { env = {}, prompts = [] } = {}) {
  const home = mkdtempSync(join(tmpdir(), "dscfg-"));
  const cwd = mkdtempSync(join(tmpdir(), "dscwd-"));
  const out = [], err = [], calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ method: init.method, path: u.pathname + u.search, auth: init.headers?.Authorization, body: init.body });
    const h = routes[`${init.method} ${u.pathname}`];
    if (!h) return new Response(JSON.stringify({ error: "nope", code: "not_found" }), { status: 404 });
    const r = typeof h === "function" ? h(u, init, calls) : h;
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r.body ?? r), { status: r.status ?? 200 });
  };
  const io = { out: (s) => out.push(s), err: (s) => err.push(s), isTTY: false, sleep: async () => {}, openUrl: () => {}, prompt: async () => prompts.shift() ?? "" };
  return { ctx: { io, env: { XDG_CONFIG_HOME: home, ...env }, cwd, fetch }, out, err, calls, home, cwd };
}

test("parseArgs", () => {
  assert.deepEqual(parseArgs(["create", "app", "--template", "worker", "--prod"]), { cmd: "create", pos: ["app"], flags: { template: "worker", prod: true } });
});

test("device login saves token with 0600 and never prints it", async () => {
  let polls = 0;
  const h = harness({
    "POST /api/cli/device": { deviceCode: DEVICE, userCode: "BCDF-GHJK", verificationUri: "https://devstack.bid/cli/device", verificationUriComplete: "https://devstack.bid/cli/device?code=BCDF-GHJK", expiresIn: 600, interval: 5 },
    "POST /api/cli/device/token": () => (++polls < 2 ? { status: 428, body: { error: "Waiting", code: "pending" } } : { token: TOKEN, clientId: "c1" }),
    "GET /api/cli/whoami": { ok: true, login: "octo", key: "devstack CLI" },
  });
  assert.equal(await run(["login"], h.ctx), 0);
  const file = join(h.home, "devstack", "auth.json");
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(join(h.home, "devstack")).mode & 0o777, 0o700);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).token, TOKEN);
  const all = h.out.join("\n") + h.err.join("\n");
  assert.ok(all.includes("BCDF-GHJK"));
  assert.ok(!all.includes(TOKEN) && !all.includes(DEVICE));
  assert.equal(polls, 2);
});

test("device login surfaces denial honestly", async () => {
  const h = harness({
    "POST /api/cli/device": { deviceCode: DEVICE, userCode: "BCDF-GHJK", verificationUri: "x", verificationUriComplete: "x", expiresIn: 600, interval: 5 },
    "POST /api/cli/device/token": { status: 403, body: { error: "Sign-in was denied.", code: "denied" } },
  });
  assert.equal(await run(["login"], h.ctx), 2);
  assert.match(h.err.join(), /denied in the browser\. Nothing was saved/);
  assert.ok(!existsSync(join(h.home, "devstack", "auth.json")));
});

test("login --token validates via whoami and rejects bad keys", async () => {
  const bad = harness({}, { prompts: ["oops"] });
  assert.equal(await run(["login", "--token"], bad.ctx), 2);
  const rej = harness({ "GET /api/cli/whoami": { status: 401, body: { error: "Invalid or revoked", code: "invalid" } } }, { prompts: [TOKEN] });
  assert.equal(await run(["login", "--token"], rej.ctx), 1);
  assert.match(rej.err.join(), /Invalid or revoked.*401/);
  assert.ok(!rej.err.join().includes(TOKEN));
});

test("whoami requires login; logout revokes and deletes", async () => {
  const h = harness({ "POST /api/cli/logout": { ok: true }, "GET /api/cli/whoami": { login: "octo", key: "k" } });
  assert.equal(await run(["whoami"], h.ctx), 2);
  h.ctx.env.DEVSTACK_TOKEN = TOKEN;
  assert.equal(await run(["whoami"], h.ctx), 0);
  assert.equal(h.calls.at(-1).auth, `Bearer ${TOKEN}`);
  delete h.ctx.env.DEVSTACK_TOKEN;
  const { writeAuth } = await import("../dist/config.js");
  writeAuth({ token: TOKEN, api: "https://devstack.bid" }, h.ctx.env);
  assert.equal(await run(["logout"], h.ctx), 0);
  assert.equal(readAuth(h.ctx.env), null);
});

test("deploy streams logs and prints the URL; failures are not reported as success", async () => {
  const mk = (final) => harness({
    "POST /api/projects/p1/builds": { ok: true, deploymentId: "d1", productionUrl: "https://app.devstack.bid" },
    "GET /api/deployments/d1/logs": (u) => u.searchParams.get("after") === "0"
      ? { deployment: { id: "d1", status: "building", url: null, environment: "production" }, job: { status: "building", active: true }, events: [{ seq: 1, phase: "install", message: "npm ci token=" + TOKEN }], next: 1 }
      : { deployment: { id: "d1", status: final, url: final === "succeeded" ? "https://app.devstack.bid" : null, environment: "production", errorCode: final === "failed" ? "build_failed" : null }, job: { status: final, active: false, errorCode: final === "failed" ? "build_failed" : null }, events: [], next: 1 },
  }, { env: { DEVSTACK_TOKEN: TOKEN } });
  const ok = mk("succeeded");
  const { writeLink } = await import("../dist/config.js");
  writeLink(ok.cwd, { projectId: "p1", name: "app", repo: "o/app", slug: "app" });
  assert.equal(await run(["deploy", "--prod"], ok.ctx), 0);
  assert.match(ok.out.join("\n"), /Ready: https:\/\/app\.devstack\.bid/);
  assert.ok(!ok.out.join("\n").includes(TOKEN));
  assert.equal(JSON.parse(ok.calls[0].body).environment, "production");
  const bad = mk("failed");
  writeLink(bad.cwd, { projectId: "p1", name: "app", repo: "o/app" });
  assert.equal(await run(["deploy"], bad.ctx), 1);
  assert.match(bad.err.join(), /failed \(build_failed\)/);
  assert.ok(!bad.out.join().includes("Ready"));
});

test("deploy without a GitHub repo is refused honestly", async () => {
  const h = harness({ "GET /api/projects": { projects: [{ id: "p1", name: "x", repo: null }] } }, { env: { DEVSTACK_TOKEN: TOKEN } });
  const { writeLink } = await import("../dist/config.js");
  writeLink(h.cwd, { projectId: "p1", name: "x", repo: null });
  assert.equal(await run(["deploy"], h.ctx), 2);
  assert.match(h.err.join(), /not supported by the server yet/);
});

test("link --repo imports and writes .devstack/project.json", async () => {
  const h = harness({ "POST /api/projects/import": { status: 201, body: { ok: true, project: { id: "p9", name: "site", repo: "o/site", slug: "site" }, build: { status: "queued", deploymentId: "d9" } } } }, { env: { DEVSTACK_TOKEN: TOKEN } });
  assert.equal(await run(["link", "--repo", "o/site"], h.ctx), 0);
  assert.equal(JSON.parse(readFileSync(join(h.cwd, ".devstack", "project.json"), "utf8")).projectId, "p9");
  assert.match(h.out.join("\n"), /devstack logs d9/);
});

test("api errors are shown with status and code", async () => {
  const h = harness({ "GET /api/projects": { status: 429, body: { error: "Too many requests.", code: "rate_limited" } } }, { env: { DEVSTACK_TOKEN: TOKEN } });
  assert.equal(await run(["link", "--project", "x"], h.ctx), 1);
  assert.match(h.err.join(), /Too many requests\. \(HTTP 429, rate_limited\)/);
});

test("unzip extracts, strips top folder and blocks traversal", () => {
  const zip = (entries) => {
    const locals = [], central = []; let off = 0;
    for (const [name, text] of entries) {
      const data = deflateRawSync(Buffer.from(text)); const n = Buffer.from(name);
      const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(data.length, 18); l.writeUInt16LE(n.length, 26);
      const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
      locals.push(l, n, data); central.push(c, n); off += 30 + n.length + data.length;
    }
    const cd = Buffer.concat(central); const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
    return Buffer.concat([...locals, cd, e]);
  };
  const dir = mkdtempSync(join(tmpdir(), "dsz-"));
  assert.deepEqual(extractZip(readZip(zip([["app/index.html", "<h1>hi</h1>"], ["app/a/b.txt", "x"]])), dir), ["index.html", "a/b.txt"]);
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), "<h1>hi</h1>");
  assert.throws(() => extractZip(readZip(zip([["../evil", "x"]])), dir), /Unsafe/);
});

test("api base must be https except loopback; redact hides secrets", () => {
  assert.throws(() => apiBase({ DEVSTACK_API: "http://evil.example" }));
  assert.equal(apiBase({ DEVSTACK_API: "http://localhost:3000/" }), "http://localhost:3000");
  assert.equal(redact(`x ${TOKEN} ${DEVICE}`), "x nvx_live_*** dvc_***");
});

test("unknown flags suggest, missing values error, both exit 2", async () => {
  const h = harness({});
  assert.equal(await run(["deploy", "--prdo"], h.ctx), 2);
  assert.match(h.err.join(), /Unknown option --prdo.*Did you mean --prod\?/);
  assert.equal(await run(["create", "app", "--template"], h.ctx), 2);
  assert.match(h.err.join(), /--template needs a value/);
  assert.equal(await run(["deplyo"], h.ctx), 2);
  assert.match(h.err.join(), /Did you mean deploy\?/);
});

test("saved token is bound to its API; env token elsewhere warns", async () => {
  const h = harness({ "GET /api/cli/whoami": { login: "octo", key: "k" } });
  const { writeAuth } = await import("../dist/config.js");
  writeAuth({ token: TOKEN, api: "https://devstack.bid" }, h.ctx.env);
  h.ctx.env.DEVSTACK_API = "https://evil.example";
  assert.equal(await run(["whoami"], h.ctx), 1);
  assert.match(h.err.join(), /will not be sent there/);
  assert.equal(h.calls.length, 0);
  h.ctx.env.DEVSTACK_TOKEN = TOKEN;
  assert.equal(await run(["whoami"], h.ctx), 0);
  assert.match(h.err.join(), /Warning: sending DEVSTACK_TOKEN to https:\/\/evil\.example/);
});

test("401/403 add a login hint and name the scope", async () => {
  const h = harness({ "POST /api/projects/p1/builds": { status: 403, body: { error: "This key lacks the cli:deploy scope.", code: "scope", scope: "cli:deploy" } } }, { env: { DEVSTACK_TOKEN: TOKEN } });
  const { writeLink } = await import("../dist/config.js");
  writeLink(h.cwd, { projectId: "p1", name: "a", repo: "o/a" });
  assert.equal(await run(["deploy"], h.ctx), 1);
  assert.match(h.err.join(), /needs the cli:deploy scope\. Run devstack login/);
});

test("login warns when replacing an existing login", async () => {
  const h = harness({ "GET /api/cli/whoami": { login: "new", key: "k" } }, { prompts: [TOKEN] });
  const { writeAuth } = await import("../dist/config.js");
  writeAuth({ token: TOKEN, api: "https://devstack.bid", login: "old" }, h.ctx.env);
  assert.equal(await run(["login", "--token"], h.ctx), 0);
  assert.match(h.err.join(), /Already signed in as old; this login will replace it/);
});
