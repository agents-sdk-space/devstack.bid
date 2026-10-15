import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/nvx21st.mjs", import.meta.url));
const run = (args, opts = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", ...opts, env: { PATH: process.env.PATH, ...opts.env } });

test("help and list", () => {
  assert.match(run(["help"]).stdout, /nvx21st 0\.2\.0/);
  assert.match(run(["list"]).stdout, /static[\s\S]*worker/);
  assert.match(run(["man"]).stdout, /^# NAME\n\nnvx21st - /);
});

test("unknown command and missing key fail cleanly", () => {
  const u = run(["nope"]);
  assert.equal(u.status, 1);
  assert.match(u.stderr, /unknown command/);
  const k = run(["whoami"]);
  assert.equal(k.status, 1);
  assert.match(k.stderr, /set DEVSTACK_KEY/);
});

test("add --print hides API_KEY_21ST", () => {
  const r = run(["add", "foo/bar", "--print"], { env: { API_KEY_21ST: "supersecretvalue" } });
  assert.equal(r.stdout.trim(), 'npx shadcn@latest add "https://21st.dev/r/foo/bar?api_key=$API_KEY_21ST"');
  assert.doesNotMatch(r.stdout, /supersecret/);
});

test("zip excludes secret files and blocks live keys", () => {
  const d = mkdtempSync(join(tmpdir(), "nvx21st-"));
  const p = join(d, "app");
  mkdirSync(join(p, "node_modules"), { recursive: true });
  writeFileSync(join(p, "wrangler.jsonc"), '{"name":"app","vars":{"TURNSTILE_SITE_KEY":"1x00000000000000000000AA"}}');
  writeFileSync(join(p, "index.html"), "<h1>hi</h1>");
  writeFileSync(join(p, ".dev.vars"), "TURNSTILE_SECRET_KEY=x");
  writeFileSync(join(p, "node_modules", "x.js"), "");
  const r = run(["zip", p, "-o", join(d, "out.zip")]);
  assert.equal(r.status, 0, r.stderr);
  const list = execFileSync("unzip", ["-Z1", join(d, "out.zip")], { encoding: "utf8" }).trim().split("\n").sort();
  assert.deepEqual(list, ["index.html", "wrangler.jsonc"]);
  execFileSync("unzip", ["-tq", join(d, "out.zip")]);
  writeFileSync(join(p, "leak.js"), `const k = "nvx_live_${"a".repeat(24)}";`);
  const b = run(["zip", p, "-o", join(d, "out2.zip")]);
  assert.equal(b.status, 1);
  assert.match(b.stderr, /possible secrets in: leak\.js/);
  assert.equal(existsSync(join(d, "out2.zip")), false);
});

test("theme merges :root/.dark vars idempotently and logo validates input", async () => {
  const d = mkdtempSync(join(tmpdir(), "nvx21st-"));
  writeFileSync(join(d, "t.css"), ":root{--background:0 0% 100%;--foreground:0 0% 0%}\n.dark{--background:0 0% 0%}\nbody{color:red}");
  writeFileSync(join(d, "styles.css"), "body{margin:0}\n");
  assert.equal(run(["theme", join(d, "t.css")], { cwd: d }).status, 0);
  assert.equal(run(["theme", join(d, "t.css")], { cwd: d }).status, 0);
  const css = execFileSync("cat", [join(d, "styles.css")], { encoding: "utf8" });
  assert.equal(css.match(/theme:start/g).length, 1);
  assert.match(css, /^body\{margin:0\}/);
  assert.match(css, /\.dark \{\n {2}--background: 0 0% 0%;\n\}/);
  assert.doesNotMatch(css, /color:red/);
  const k = run(["theme", "abc123"], { cwd: d });
  assert.match(k.stderr, /needs API_KEY_21ST/);
  assert.match(run(["logo"]).stderr, /usage: nvx21st logo/);
});
