// DevStack build server (inside the build container). One POST /build per container instance.
// Streams NDJSON: {"t":"log","phase","line"} … {"t":"result","ok",...}; GET /artifact returns a tar of the output.
// The GitHub token is passed to git via an http.extraheader in GIT_CONFIG_* env (never argv, never logged).
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";

const WORK = process.env.BUILD_WORKDIR || "/work";
const SRC = join(WORK, "src");
const HOME_DIR = join(WORK, ".home");
let state = { running: false, done: false, output: null, child: null, canceled: false };

const SAFE_CMD = /^[\w@%+=:,./ -]{1,300}$/; // no shell metacharacters ; | & $ ` > < ( ) \ " '
const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_.-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;
const REL = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._\/-]{0,200}$/;
const ENVKEY = /^[A-Z_][A-Z0-9_]{0,63}$/;
const BLOCKED_ENV = new Set(["PATH", "HOME", "NODE_OPTIONS", "LD_PRELOAD", "LD_LIBRARY_PATH", "GIT_CONFIG_COUNT", "GIT_ASKPASS", "BASH_ENV", "ENV"]);

function detectPm(dir) {
  if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) return { pm: "bun", install: "bun install --frozen-lockfile" };
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return { pm: "pnpm", install: "pnpm install --frozen-lockfile" };
  if (existsSync(join(dir, "yarn.lock"))) return { pm: "yarn", install: "yarn install --frozen-lockfile" };
  if (existsSync(join(dir, "package-lock.json"))) return { pm: "npm", install: "npm ci" };
  if (existsSync(join(dir, "package.json"))) return { pm: "npm", install: "npm install" };
  return { pm: null, install: null };
}

function run(cmd, args, opts, phase, emit) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"] });
    state.child = child;
    const pipe = (s) => s.on("data", (b) => emit({ t: "log", phase, chunk: b.toString("utf8") }));
    pipe(child.stdout); pipe(child.stderr);
    child.on("close", (code, signal) => { state.child = null; resolve({ code, signal }); });
    child.on("error", (e) => { state.child = null; emit({ t: "log", phase, chunk: `spawn error: ${e.code ?? e.message}\n` }); resolve({ code: 127 }); });
  });
}

/** Parse a simple command line into argv (no shell). */
function argv(cmd) {
  if (!SAFE_CMD.test(cmd)) throw new Error("command contains characters that are not allowed");
  return cmd.trim().split(/\s+/);
}

/** Remove the clone credential from the git env object (it is never passed to install/build). */
export function scrubGitEnv(gitEnv) {
  for (const k of Object.keys(gitEnv)) if (k.startsWith("GIT_CONFIG_")) delete gitEnv[k];
}

/** Rewrite .git/config so no extraheader, credential helper or token-bearing remote URL survives into install/build. */
export function scrubCheckout(src, repo) {
  const cfg = join(src, ".git", "config");
  if (!existsSync(cfg)) return;
  const kept = [];
  let section = "";
  for (const line of readFileSync(cfg, "utf8").split("\n")) {
    const t = line.trim();
    if (t.startsWith("[")) { section = t.toLowerCase(); if (section.startsWith("[credential") || section.startsWith("[http")) continue; }
    else if (section.startsWith("[credential") || section.startsWith("[http")) continue;
    if (/^\s*(extraheader|helper)\s*=/i.test(line)) continue;
    if (/^\s*url\s*=/i.test(line)) { kept.push(`\turl = https://github.com/${repo}.git`); continue; }
    kept.push(line);
  }
  writeFileSync(cfg, kept.join("\n"));
}


const OPENNEXT_PKG = "@opennextjs/cloudflare@1";
const OPENNEXT_CONFIG = `import { defineCloudflareConfig } from "@opennextjs/cloudflare";\n\n// Added by DevStack at build time (repo had no open-next.config.ts).\nexport default defineCloudflareConfig();\n`;
const anyOf = (dir, names) => names.some((n) => existsSync(join(dir, n)));

/** Plain create-next-app repos have no Cloudflare config: add it at build time so the OpenNext build works with no manual steps. Returns the files written. */
export function prepareOpenNext(dir, buildCmd) {
  if (!/(^|\s)opennextjs-cloudflare(\s|$)/.test(buildCmd ?? "") || !existsSync(join(dir, "package.json"))) return [];
  let pkg;
  try { pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); } catch { return []; }
  if (!pkg.dependencies?.next && !pkg.devDependencies?.next) return [];
  const added = [];
  if (!anyOf(dir, ["open-next.config.ts", "open-next.config.mjs", "open-next.config.js"])) { writeFileSync(join(dir, "open-next.config.ts"), OPENNEXT_CONFIG); added.push("open-next.config.ts"); }
  if (!anyOf(dir, ["wrangler.jsonc", "wrangler.json", "wrangler.toml"])) {
    const name = String(pkg.name || "app").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 63) || "app";
    writeFileSync(join(dir, "wrangler.jsonc"), JSON.stringify({ name, main: ".open-next/worker.js", compatibility_date: "2026-10-01", compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"], assets: { directory: ".open-next/assets", binding: "ASSETS" } }, null, 2) + "\n");
    added.push("wrangler.jsonc");
  }
  return added;
}

/** Install command for the OpenNext adapter when the repo doesn't depend on it (null when already installed). */
export function openNextInstallCmd(dir, pm) {
  if (existsSync(join(dir, "node_modules", "@opennextjs", "cloudflare", "package.json"))) return null;
  if (pm === "pnpm") return `pnpm add -D ${OPENNEXT_PKG}`;
  if (pm === "yarn") return `yarn add -D ${OPENNEXT_PKG}`;
  if (pm === "bun") return `bun add -d ${OPENNEXT_PKG}`;
  return `npm install --no-save ${OPENNEXT_PKG}`;
}

async function build(spec, emit) {
  if (!REPO.test(spec.repo) || !SHA.test(spec.commit) || !REL.test(spec.root ?? "") || !REL.test(spec.output ?? "")) throw Object.assign(new Error("invalid build spec"), { code: "invalid_config" });
  mkdirSync(HOME_DIR, { recursive: true });
  const baseEnv = { PATH: process.env.PATH, HOME: HOME_DIR, CI: "1", NEXT_TELEMETRY_DISABLED: "1", COREPACK_ENABLE_DOWNLOAD_PROMPT: "0", npm_config_update_notifier: "false" };
  const userEnv = {};
  for (const [k, v] of Object.entries(spec.env ?? {})) if (ENVKEY.test(k) && !BLOCKED_ENV.has(k) && typeof v === "string" && v.length <= 32_768) userEnv[k] = v;
  // Token only reaches git, through config env vars (not argv, not the build's env).
  const gitEnv = { ...baseEnv, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "safe.directory", GIT_CONFIG_VALUE_0: SRC };
  if (spec.token) { gitEnv.GIT_CONFIG_KEY_1 = "http.https://github.com/.extraheader"; gitEnv.GIT_CONFIG_VALUE_1 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${spec.token}`).toString("base64")}`; }
  else gitEnv.GIT_CONFIG_COUNT = "1";
  spec.token = null;

  emit({ t: "phase", phase: "installing" });
  emit({ t: "log", phase: "installing", chunk: `Cloning ${spec.repo}@${spec.commit.slice(0, 7)}\n` });
  for (const args of [["init", "-q", SRC], ["-C", SRC, "remote", "add", "origin", `https://github.com/${spec.repo}.git`], ["-C", SRC, "fetch", "-q", "--depth", "1", "origin", spec.commit], ["-C", SRC, "checkout", "-q", "FETCH_HEAD"]]) {
    const r = await run("git", args, { cwd: WORK, env: gitEnv }, "installing", emit);
    if (state.canceled) return { ok: false, code: "canceled" };
    if (r.code !== 0) { scrubGitEnv(gitEnv); return { ok: false, code: "github", message: `git ${args.find((a) => !a.startsWith("-") && a !== SRC) ?? ""} failed (exit ${r.code})` }; }
  }
  // Clone done: drop the credential from memory and make sure nothing credential-like stays in the checkout.
  scrubGitEnv(gitEnv);
  scrubCheckout(SRC, spec.repo);
  const dir = normalize(join(SRC, spec.root || "."));
  if (!dir.startsWith(SRC) || !existsSync(dir)) return { ok: false, code: "invalid_config", message: "root directory not found" };
  const env = { ...baseEnv, ...userEnv, NODE_ENV: "production" };
  const detected = detectPm(dir);
  const install = spec.install || detected.install;
  if (install) {
    emit({ t: "log", phase: "installing", chunk: `$ ${install}\n` });
    const a = argv(install);
    // Dev dependencies are needed to build.
    const r = await run(a[0], a.slice(1), { cwd: dir, env: { ...env, NODE_ENV: "development" } }, "installing", emit);
    if (state.canceled) return { ok: false, code: "canceled" };
    if (r.code !== 0) return { ok: false, code: "install_failed", message: `install exited with ${r.code}` };
  }
  let buildCmd = spec.build;
  if (!buildCmd && existsSync(join(dir, "package.json"))) {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (pkg.scripts?.build) buildCmd = `${detected.pm ?? "npm"} run build`;
  }
  const added = prepareOpenNext(dir, buildCmd);
  if (added.length) emit({ t: "log", phase: "installing", chunk: `Repo has no Cloudflare config; added ${added.join(", ")} for this build (commit them to customize).\n` });
  const adapter = buildCmd && /(^|\s)opennextjs-cloudflare(\s|$)/.test(buildCmd) ? openNextInstallCmd(dir, detected.pm) : null;
  if (adapter) {
    emit({ t: "log", phase: "installing", chunk: `@opennextjs/cloudflare is not a dependency; installing it for this build.\n$ ${adapter}\n` });
    const a = argv(adapter);
    const r = await run(a[0], a.slice(1), { cwd: dir, env: { ...env, NODE_ENV: "development" } }, "installing", emit);
    if (state.canceled) return { ok: false, code: "canceled" };
    if (r.code !== 0) return { ok: false, code: "install_failed", message: `could not add @opennextjs/cloudflare (exit ${r.code}); it needs next >=15.5.28 (15.x) or >=16.4.1, so upgrade next in package.json` };
  }
  emit({ t: "phase", phase: "building" });
  if (buildCmd) {
    emit({ t: "log", phase: "building", chunk: `$ ${buildCmd}\n` });
    const a = argv(buildCmd);
    const r = await run(a[0], a.slice(1), { cwd: dir, env }, "building", emit);
    if (state.canceled) return { ok: false, code: "canceled" };
    if (r.code !== 0) return { ok: false, code: "build_failed", message: `build exited with ${r.code}` };
  }
  const out = normalize(join(dir, spec.output || "."));
  if (!out.startsWith(SRC) || !existsSync(out) || !statSync(out).isDirectory()) return { ok: false, code: "missing_index", message: `output directory "${spec.output || "."}" not found` };
  // Server app (OpenNext for Cloudflare): bundle .open-next/worker.js into one module + assets.
  const openNext = existsSync(join(out, "worker.js")) && existsSync(join(out, "assets")) ? out : existsSync(join(dir, ".open-next", "worker.js")) ? join(dir, ".open-next") : null;
  if (openNext && !existsSync(join(out, "index.html"))) {
    const r = await bundleServer(dir, openNext, env, emit);
    if (state.canceled) return { ok: false, code: "canceled" };
    if (!r.ok) return r;
    state.output = r.output;
    emit({ t: "phase", phase: "uploading" });
    return { ok: true, server: true };
  }
  if (!existsSync(join(out, "index.html"))) return { ok: false, code: "missing_index", message: "index.html not found in the output directory (static output required)" };
  state.output = out;
  emit({ t: "phase", phase: "uploading" });
  return { ok: true };
}

/** `wrangler deploy --dry-run` bundles the OpenNext worker (no Cloudflare credentials involved). */
export async function bundleServer(dir, openNext, env, emit) {
  const outDir = join(WORK, "server-bundle");
  mkdirSync(join(outDir, "worker"), { recursive: true });
  const flags = ["nodejs_compat", "global_fetch_strictly_public"];
  const date = "2026-10-01";
  const cfg = join(WORK, "server-wrangler.json");
  writeFileSync(cfg, JSON.stringify({ name: "devstack-server-bundle", main: join(openNext, "worker.js"), compatibility_date: date, compatibility_flags: flags, assets: { directory: join(openNext, "assets"), binding: "ASSETS" } }));
  emit({ t: "log", phase: "building", chunk: "$ wrangler deploy --dry-run (bundle server worker)\n" });
  const local = join(dir, "node_modules", ".bin", "wrangler");
  const [cmd, args] = existsSync(local) ? [local, []] : ["npx", ["--yes", "wrangler@4"]];
  const r = await run(cmd, [...args, "deploy", "--dry-run", "--config", cfg, "--outdir", join(outDir, "worker")], { cwd: dir, env: { ...env, WRANGLER_SEND_METRICS: "false" } }, "building", emit);
  if (r.code !== 0) return { ok: false, code: "build_failed", message: `server bundle exited with ${r.code}` };
  if (!existsSync(join(outDir, "worker", "worker.js"))) return { ok: false, code: "missing_index", message: "server bundle produced no worker.js" };
  const cp = await run("cp", ["-r", join(openNext, "assets"), join(outDir, "assets")], { cwd: dir, env }, "building", emit);
  if (cp.code !== 0) return { ok: false, code: "build_failed", message: "could not copy server assets" };
  for (const f of ["worker.js.map", "README.md"]) { try { rmSync(join(outDir, "worker", f), { force: true }); } catch {} }
  writeFileSync(join(outDir, "server.json"), JSON.stringify({ compatibility_date: date, compatibility_flags: flags }));
  return { ok: true, output: outDir };
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") { res.end("ok"); return; }
  if (req.method === "POST" && req.url === "/cancel") {
    state.canceled = true;
    state.child?.kill("SIGTERM");
    setTimeout(() => state.child?.kill("SIGKILL"), 5000).unref();
    res.end("ok");
    return;
  }
  if (req.method === "GET" && req.url === "/artifact") {
    if (!state.output) { res.statusCode = 404; res.end(); return; }
    res.setHeader("Content-Type", "application/x-tar");
    const tar = spawn("tar", ["-C", state.output, "--exclude=.git", "--exclude=node_modules", "--no-same-owner", "-cf", "-", "."], { stdio: ["ignore", "pipe", "ignore"] });
    tar.stdout.pipe(res);
    return;
  }
  if (req.method === "POST" && req.url === "/build") {
    if (state.running || state.done) { res.statusCode = 409; res.end(); return; }
    state.running = true;
    let raw = "";
    for await (const c of req) { raw += c; if (raw.length > 512_000) { res.statusCode = 413; res.end(); return; } }
    let spec;
    try { spec = JSON.parse(raw); } catch { res.statusCode = 400; res.end(); return; }
    res.setHeader("Content-Type", "application/x-ndjson");
    const emit = (o) => res.write(JSON.stringify(o) + "\n");
    let result;
    try { result = await build(spec, emit); } catch (e) { result = { ok: false, code: e.code ?? "internal", message: String(e.message ?? e).slice(0, 300) }; }
    state.done = true;
    state.running = false;
    emit({ t: "result", ...result });
    res.end();
    return;
  }
  res.statusCode = 404;
  res.end();
});
if (!process.env.BUILD_SERVER_NO_LISTEN) server.listen(Number(process.env.PORT || 8080));
