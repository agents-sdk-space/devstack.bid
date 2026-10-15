#!/usr/bin/env node
// nvx21st: devstack.bid template CLI (zero dependencies). See nvx21st.1.md.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { deflateRawSync } from "node:zlib";

const VERSION = "0.2.0";
const api = () => (process.env.DEVSTACK_API || "https://devstack.bid").replace(/\/+$/, "");
const TEMPLATES = {
  static: "Static site on Workers Assets (HTML/CSS/JS, no build step)",
  worker: "Cloudflare Worker with a fetch handler (JavaScript)",
};
const SKIP = /(^|\/)(\.env(\..*)?|\.dev\.vars(\..*)?|\.git|node_modules|\.wrangler|\.npmrc|\.DS_Store|\.next|.*-deploy\.zip)(\/|$)/i;
const SECRET_LIKE = /(nvx_live_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|0x4AAAAAA[A-Za-z0-9_-]{20,})/;
const TEST_KEYS = /^(1x0000000000000000000000000000000AA|2x0000000000000000000000000000000AA|1x0000000000000000000000000000000BB|3x0000000000000000000000000000000AA)$/;

const help = () => `nvx21st ${VERSION} - devstack.bid template CLI

Usage: nvx21st <command> [options]

Commands:
  list                         List starter templates
  new <name> [-t static|worker] Create a project from a template (needs DEVSTACK_KEY)
  add <user>/<slug> [--print]  Add a 21st.dev component via shadcn
  theme <id|url|file.css>      Apply a theme's :root/.dark CSS variables (--into, --print)
  logo <query> [--save dir]    Search brand SVG logos (svgl via 21st), save one (--dark, --wordmark)
  search <query> [--type t]    Search 21st (delegates to npx @21st-dev/cli)
  publish <file> [21st flags]  Publish to 21st (delegates to npx @21st-dev/cli)
  registry [@ns] [--user u]    Add the 21st shadcn registry to components.json (key by env reference)
  zip [dir] [-o file]          Pack a folder into a deploy-ready zip (secrets excluded)
  deploy [dir] [--dry-run]     Run wrangler deploy with your own Cloudflare login
  whoami                       Show the devstack.bid account for DEVSTACK_KEY
  help | man                   Show this help or the manual

Options: -h --help, -v --version, --api <url> (or DEVSTACK_API)
Docs: ${api()}/docs  ·  Keys: ${api()}/settings/cli`;

class CliError extends Error {}
const die = (m) => { throw new CliError(m); };
const log = (m) => process.stdout.write(m + "\n");

function parse(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { pos.push(...argv.slice(i + 1)); break; }
    const m = a.match(/^--?([a-z-]+)(?:=(.*))?$/i);
    if (!m) { pos.push(a); continue; }
    const k = { t: "template", o: "out", h: "help", v: "version", n: "pick" }[m[1]] || m[1];
    const valued = ["template", "out", "api", "into", "save", "pick", "user", "library", "type"].includes(k);
    flags[k] = m[2] ?? (valued ? argv[++i] : true);
    if (valued && flags[k] === undefined) die(`--${k} needs a value`);
  }
  return { pos, flags };
}

function safeName(s) {
  const n = String(s || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
  if (!n) die("project name must contain letters, digits or dashes");
  return n;
}

function cliKey() {
  const k = process.env.DEVSTACK_KEY || "";
  if (!k) die(`set DEVSTACK_KEY first (create one at ${api()}/settings/cli)`);
  if (!k.startsWith("nvx_live_")) die("DEVSTACK_KEY must start with nvx_live_");
  return k;
}

async function call(path, init = {}) {
  const res = await fetch(api() + path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${cliKey()}` } }).catch((e) => die(`cannot reach ${api()}: ${e.message}`));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    die(body.error || `request failed (HTTP ${res.status})`);
  }
  return res;
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = ~0; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return ~c >>> 0; };

export function zipFiles(entries) {
  const local = [], central = [];
  let off = 0;
  for (const { path, data } of entries) {
    const name = Buffer.from(path), comp = deflateRawSync(data), crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x031e, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE((0o100644 << 16) >>> 0, 38); c.writeUInt32LE(off, 42);
    local.push(h, name, comp); central.push(c, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...local, cd, end]);
}

export function collect(dir) {
  const out = [], skipped = [];
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f), rel = relative(dir, p).split("\\").join("/");
      if (SKIP.test(rel)) { skipped.push(rel); continue; }
      const st = statSync(p);
      if (st.isDirectory()) walk(p); else if (st.isFile()) out.push({ path: rel, data: readFileSync(p) });
    }
  };
  walk(dir);
  return { files: out, skipped };
}

export function findSecrets(files) {
  const hits = [];
  for (const f of files) {
    if (f.data.length > 2_000_000) continue;
    const m = f.data.toString("utf8").match(SECRET_LIKE);
    if (m && !TEST_KEYS.test(m[0])) hits.push(f.path);
  }
  return hits;
}


const THEME_START = "/* nvx21st theme:start */", THEME_END = "/* nvx21st theme:end */";
const CSS_TARGETS = ["app/globals.css", "src/app/globals.css", "src/index.css", "src/styles.css", "styles.css", "style.css"];

export function themeBlocks(css) {
  const out = {};
  for (const [sel, key] of [[":root", "root"], [".dark", "dark"]]) {
    const re = new RegExp(`(^|[\\s}])${sel.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "g");
    const vars = [];
    for (const m of css.matchAll(re)) for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) vars.push(`  ${d[1]}: ${d[2].trim()};`);
    if (vars.length) out[key] = [...new Map(vars.map((v) => [v.split(":")[0], v])).values()];
  }
  if (!out.root) die("no :root { --var: … } block found in that theme");
  return out;
}

export function applyTheme(existing, blocks, source) {
  const block = [THEME_START, `/* source: ${source} */`, `:root {\n${blocks.root.join("\n")}\n}`, ...(blocks.dark ? [`.dark {\n${blocks.dark.join("\n")}\n}`] : []), THEME_END].join("\n");
  const i = existing.indexOf(THEME_START), j = existing.indexOf(THEME_END);
  if (i !== -1 && j > i) return existing.slice(0, i) + block + existing.slice(j + THEME_END.length);
  return (existing && !existing.endsWith("\n") ? existing + "\n" : existing) + (existing ? "\n" : "") + block + "\n";
}

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": `nvx21st/${VERSION}` } }).catch((e) => die(`cannot reach ${new URL(url).host}: ${e.message}`));
  if (!res.ok) die(`${new URL(url).host} answered HTTP ${res.status}`);
  return res.text();
}

const mask = (t) => [process.env.API_KEY_21ST, process.env.TWENTYFIRST_TOKEN].filter(Boolean).reduce((a, k) => a.split(k).join("***"), t);

async function themeCss(src) {
  if (/^https:\/\//.test(src)) return getText(src);
  if (/\.css$/i.test(src)) { if (!existsSync(src)) die(`${src} not found`); return readFileSync(src, "utf8"); }
  if (!/^[\w-]+$/.test(src)) die("theme must be a 21st theme id, an https:// URL or a .css file");
  if (!process.env.API_KEY_21ST && !process.env.TWENTYFIRST_TOKEN) die("fetching a 21st theme by id needs API_KEY_21ST (or `npx @21st-dev/cli login`); a URL or .css file works without it");
  const r = spawnSync("npx", ["--yes", "@21st-dev/cli@1", "theme", src], { encoding: "utf8", maxBuffer: 4_000_000 });
  if (r.status !== 0) die(`21st theme ${src} failed: ${mask((r.stderr || r.stdout || "").trim().split("\n").pop())}`);
  return mask(r.stdout);
}

function run21st(args) {
  log(`→ npx @21st-dev/cli ${args.join(" ")}`);
  const r = spawnSync("npx", ["--yes", "@21st-dev/cli@1", ...args], { stdio: "inherit" });
  if (r.status !== 0) die("21st command failed (sign in with `npx @21st-dev/cli login`, or export API_KEY_21ST)");
}

export function registryEntry(cfg, ns, user, library) {
  return { ...cfg, registries: { ...(cfg.registries || {}), [ns]: { url: `https://21st.dev/r/${user}/${library}/{name}.json`, headers: { Authorization: "Bearer ${API_KEY_21ST}" } } } };
}

const commands = {
  async list() {
    log("Templates (nvx21st new <name> -t <template>):");
    for (const [id, d] of Object.entries(TEMPLATES)) log(`  ${id.padEnd(8)} ${d}`);
  },
  async whoami() {
    const j = await (await call("/api/cli/whoami")).json();
    log(`signed in${j.login ? ` as ${j.login}` : ""}${j.key ? ` (key: ${j.key})` : ""}`);
  },
  async new({ pos, flags }) {
    const name = safeName(pos[0] || die("usage: nvx21st new <name> [-t static|worker]"));
    const template = flags.template || "static";
    if (!TEMPLATES[template]) die(`unknown template "${template}" (run: nvx21st list)`);
    const dest = resolve(name), zipPath = `${dest}-deploy.zip`;
    if (existsSync(dest)) die(`${dest} already exists`);
    cliKey();
    log(`→ Creating ${name} from ${template}`);
    const res = await call("/api/cli/scaffold", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, template }) });
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    const u = spawnSync("unzip", ["-q", zipPath, "-d", process.cwd()], { stdio: "inherit" });
    if (u.status !== 0) die(`unzip failed; the zip is at ${zipPath}`);
    log(`✓ ${dest}\n  zip: ${zipPath}\n  next: cd ${relative(process.cwd(), dest) || "."} && nvx21st deploy`);
  },
  async add({ pos, flags }) {
    const id = pos[0] || "";
    if (!/^[\w.-]+\/[\w.-]+$/.test(id) && !/^@[\w.-]+$/.test(id)) die("usage: nvx21st add <user>/<slug> [--print]");
    const keyed = Boolean(process.env.API_KEY_21ST);
    const url = id.startsWith("@") ? id : `https://21st.dev/r/${id}${keyed ? "?api_key=" : ""}`;
    const shown = url + (keyed && !id.startsWith("@") ? "$API_KEY_21ST" : "");
    if (flags.print) { log(`npx shadcn@latest add "${shown}"`); return; }
    if (!existsSync("components.json")) log("note: no components.json here; shadcn will offer to create one.");
    const real = url + (keyed && !id.startsWith("@") ? encodeURIComponent(process.env.API_KEY_21ST) : "");
    log(`→ npx shadcn@latest add "${shown}"`);
    const r = spawnSync("npx", ["--yes", "shadcn@latest", "add", real], { stdio: "inherit" });
    if (r.status !== 0) die("shadcn add failed (21st installs may need API_KEY_21ST and a 21st membership)");
  },
  async theme({ pos, flags }) {
    const src = pos[0] || die("usage: nvx21st theme <id|https-url|file.css> [--into file.css] [--print]");
    const blocks = themeBlocks(await themeCss(src));
    const label = /^https?:/.test(src) ? new URL(src).host + new URL(src).pathname : src;
    if (flags.print) { log(applyTheme("", blocks, label).trimEnd()); return; }
    const target = resolve(flags.into || CSS_TARGETS.find((f) => existsSync(f)) || "theme.css");
    const before = existsSync(target) ? readFileSync(target, "utf8") : "";
    writeFileSync(target, applyTheme(before, blocks, label));
    log(`✓ ${relative(process.cwd(), target)}: ${blocks.root.length} :root vars${blocks.dark ? `, ${blocks.dark.length} .dark vars` : ""}${before.includes(THEME_START) ? " (replaced previous theme)" : ""}`);
    if (!before && /theme\.css$/.test(target)) log('  link it: <link rel="stylesheet" href="theme.css">');
  },
  async logo({ pos, flags }) {
    const q = pos.join(" ").trim() || die("usage: nvx21st logo <query> [--save dir] [--dark] [--wordmark] [--pick n] [--json]");
    const list = JSON.parse(await getText(`https://api.svgl.app?search=${encodeURIComponent(q)}`));
    if (!Array.isArray(list) || !list.length) die(`no logo found for "${q}"`);
    if (flags.json) { log(JSON.stringify(list, null, 2)); return; }
    const variant = flags.dark ? "dark" : "light";
    const urlOf = (l) => { const r = flags.wordmark ? l.wordmark : l.route; return typeof r === "string" ? r : r?.[variant]; };
    if (!flags.save) {
      list.slice(0, 10).forEach((l, i) => log(`  ${String(i + 1).padStart(2)}. ${l.title.padEnd(24)} ${urlOf(l) || "(no " + (flags.wordmark ? "wordmark" : "icon") + ")"}`));
      log(`save one: nvx21st logo "${q}" --save public/logos [--pick n] [--dark] [--wordmark]`);
      return;
    }
    const exact = list.find((l) => l.title.toLowerCase() === q.toLowerCase());
    const pick = (flags.pick ? list[Number(flags.pick) - 1] : exact || list[0]) || die(`--pick must be 1-${list.length}`);
    const url = urlOf(pick) || die(`${pick.title} has no ${flags.wordmark ? "wordmark" : "icon"} variant`);
    const svg = await getText(url);
    if (!/<svg[\s>]/i.test(svg) || /<script|\son\w+\s*=/i.test(svg)) die("downloaded file is not a clean SVG; not saved");
    const dir = resolve(flags.save === true ? "." : flags.save);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, basename(new URL(url).pathname));
    writeFileSync(file, svg);
    log(`✓ ${relative(process.cwd(), file)} (${pick.title}${pick.url ? `, ${pick.url}` : ""}). Check the brand's guidelines before use.`);
  },
  async search({ pos, flags }) {
    if (!pos.length) die('usage: nvx21st search "<query>" [--type component|theme|template]');
    run21st(["search", pos.join(" "), ...(flags.type ? ["--type", flags.type] : [])]);
  },
  async publish({ pos }) {
    if (!pos[0]) die("usage: nvx21st publish <file> [--to slug --visibility published|private ...] (put 21st flags after --)");
    run21st(["publish", ...pos]);
  },
  async registry({ pos, flags }) {
    const ns = pos[0] || "@nvx21st";
    if (!/^@[\w-]+$/.test(ns)) die("namespace must look like @name");
    const user = flags.user || "thanabartbb", library = flags.library || "default";
    if (!/^[\w.-]+$/.test(user) || !/^[\w.-]+$/.test(library)) die("invalid --user or --library");
    const f = resolve("components.json");
    const cfg = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { $schema: "https://ui.shadcn.com/schema.json" };
    writeFileSync(f, JSON.stringify(registryEntry(cfg, ns, user, library), null, 2) + "\n");
    log(`✓ components.json: ${ns} → 21st.dev/r/${user}/${library}/{name}.json (Authorization uses \${API_KEY_21ST}, no key written)\n  use: npx shadcn@latest add ${ns}/<name>`);
  },
  async zip({ pos, flags }) {
    const dir = resolve(pos[0] || ".");
    if (!existsSync(dir) || !statSync(dir).isDirectory()) die(`${dir} is not a folder`);
    if (!readdirSync(dir).some((f) => /^wrangler\.(jsonc?|toml)$/.test(f))) die("no wrangler.jsonc/json/toml in that folder; is it a deploy-ready project?");
    const { files, skipped } = collect(dir);
    const hits = findSecrets(files);
    if (hits.length && !flags.force) die(`possible secrets in: ${hits.join(", ")} (remove them, or --force if they are test keys)`);
    const out = resolve(flags.out || join(dir, "..", `${basename(dir)}-deploy.zip`));
    writeFileSync(out, zipFiles(files.filter((f) => resolve(dir, f.path) !== out)));
    log(`✓ ${out} (${files.length} files${skipped.length ? `, skipped ${skipped.length}: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? ", …" : ""}` : ""})`);
  },
  async deploy({ pos, flags }) {
    const dir = resolve(pos[0] || ".");
    if (!readdirSync(dir).some((f) => /^wrangler\.(jsonc?|toml)$/.test(f))) die(`no wrangler config in ${dir}`);
    if (Number(process.versions.node.split(".")[0]) < 22) die(`wrangler 4 needs Node.js 22+, you have ${process.version}`);
    const args = ["--yes", "wrangler@4", "deploy", ...(flags["dry-run"] ? ["--dry-run"] : [])];
    log(`→ npx ${args.slice(1).join(" ")}  (in ${dir}, using your own wrangler login)`);
    const r = spawnSync("npx", args, { cwd: dir, stdio: "inherit" });
    if (r.status !== 0) die("wrangler deploy failed (run: npx wrangler login)");
  },
  async man() {
    const p = new URL("../nvx21st.1.md", import.meta.url);
    log(existsSync(p) ? readFileSync(p, "utf8") : help());
  },
  async help() { log(help()); },
};

export async function main(argv) {
  const { pos, flags } = parse(argv);
  if (flags.api) process.env.DEVSTACK_API = flags.api;
  if (flags.version) return log(VERSION);
  const cmd = pos.shift() || "help";
  if (flags.help) return log(help());
  const fn = commands[cmd === "init" ? "new" : cmd];
  if (!fn) die(`unknown command "${cmd}" (run: nvx21st help)`);
  await fn({ pos, flags });
}

if (/nvx21st(\.mjs)?$/.test(process.argv[1] || "")) {
  main(process.argv.slice(2)).catch((e) => {
    process.stderr.write(`nvx21st: ${e instanceof CliError ? e.message : e.stack}\n`);
    process.exit(1);
  });
}
