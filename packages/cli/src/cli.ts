import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Api, ApiError, redact, type Fetch } from "./api.js";
import { apiBase, clearAuth, readAuth, readLink, TOKEN_RE, writeAuth, writeLink, type Link } from "./config.js";
import { extractZip, readZip } from "./unzip.js";

export const VERSION = "0.1.0";

export interface Io {
  out(s: string): void;
  err(s: string): void;
  prompt(q: string, hidden?: boolean): Promise<string>;
  sleep(ms: number): Promise<void>;
  openUrl(url: string): void;
  isTTY: boolean;
}

export interface Ctx { io: Io; env: NodeJS.ProcessEnv; cwd: string; fetch: Fetch }

type Flags = Record<string, string | boolean>;
export function parseArgs(argv: string[]): { cmd: string; pos: string[]; flags: Flags } {
  const pos: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) flags[k] = v;
      else if (["template", "project", "repo", "branch", "name", "ref", "root"].includes(k) && argv[i + 1] && !argv[i + 1].startsWith("-")) flags[k] = argv[++i];
      else flags[k] = true;
    } else if (a === "-h") flags.help = true;
    else if (a === "-v") flags.version = true;
    else pos.push(a);
  }
  return { cmd: pos.shift() ?? "", pos, flags };
}

const HELP = `devstack ${VERSION} — CLI for devstack.bid

Usage: devstack <command> [options]

  login [--token] [--no-browser]   Sign in (browser device code, or paste a key from devstack.bid/settings/cli)
  logout                           Revoke this machine's key and delete local credentials
  whoami                           Show the signed-in account
  templates                        List templates
  create <name> --template <id>    New project from a template (starter zip, or a GitHub repo for repo templates)
  init [--template static|worker]  Scaffold a starter into the current (empty) folder
  link [--project <id|name>] [--repo owner/name] [--branch b] [--root dir]
                                   Link this folder to a project; --repo imports a GitHub repo via your GitHub connection
  deploy [--prod] [--ref <git ref>] Build & deploy the linked project's GitHub repo, streaming logs
  status                           Linked project and recent deployments
  logs <deployment-id> [--follow]  Build log for a deployment

Env: DEVSTACK_TOKEN (CI), DEVSTACK_API (default https://devstack.bid)
Credentials: ~/.config/devstack/auth.json (mode 0600)`;

class UserError extends Error {}

function api(ctx: Ctx): Api {
  const a = readAuth(ctx.env);
  if (!a) throw new UserError("Not signed in. Run `devstack login` (or set DEVSTACK_TOKEN).");
  return new Api(a.api, a.token, ctx.fetch);
}

function needLink(ctx: Ctx): Link {
  const l = readLink(ctx.cwd);
  if (!l) throw new UserError("This folder is not linked. Run `devstack link`.");
  return l;
}

const siteHost = (base: string, slug?: string | null) => (slug ? `https://${slug}.${new URL(base).hostname.replace(/^www\./, "")}` : null);

async function login(ctx: Ctx, flags: Flags) {
  const base = apiBase(ctx.env);
  if (flags.token) {
    const token = (await ctx.io.prompt("Paste your devstack CLI key (input hidden): ", true)).trim();
    if (!TOKEN_RE.test(token)) throw new UserError("That does not look like a devstack key (nvx_live_…). Create one at devstack.bid/settings/cli.");
    const who = await new Api(base, token, ctx.fetch).req<{ login: string | null }>("GET", "/api/cli/whoami");
    const file = writeAuth({ token, api: base, login: who.login }, ctx.env);
    ctx.io.out(`Signed in${who.login ? ` as ${who.login}` : ""}. Saved to ${file}`);
    return;
  }
  const anon = new Api(base, null, ctx.fetch);
  const host = (() => { try { return execFileSync("hostname", { encoding: "utf8" }).trim(); } catch { return "computer"; } })();
  const d = await anon.req<{ deviceCode: string; userCode: string; verificationUri: string; verificationUriComplete: string; expiresIn: number; interval: number }>("POST", "/api/cli/device", { clientName: `devstack CLI (${host})` });
  ctx.io.out(`Open ${d.verificationUri} and confirm this code:\n\n    ${d.userCode}\n`);
  if (!flags["no-browser"] && ctx.io.isTTY) ctx.io.openUrl(d.verificationUriComplete);
  ctx.io.out("Waiting for approval…");
  let interval = Math.max(1, d.interval) * 1000;
  const deadline = Date.now() + d.expiresIn * 1000;
  while (Date.now() < deadline) {
    await ctx.io.sleep(interval);
    try {
      const r = await anon.req<{ token: string }>("POST", "/api/cli/device/token", { deviceCode: d.deviceCode });
      const who = await new Api(base, r.token, ctx.fetch).req<{ login: string | null }>("GET", "/api/cli/whoami");
      const file = writeAuth({ token: r.token, api: base, login: who.login }, ctx.env);
      ctx.io.out(`Signed in${who.login ? ` as ${who.login}` : ""}. Saved to ${file}`);
      return;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.code === "pending") continue;
      if (e.code === "slow_down") { interval += 5000; continue; }
      throw e;
    }
  }
  throw new UserError("The code expired before it was approved. Run `devstack login` again.");
}

async function logout(ctx: Ctx) {
  const a = readAuth(ctx.env);
  if (!a) { ctx.io.out("Not signed in."); return; }
  if (ctx.env.DEVSTACK_TOKEN) throw new UserError("DEVSTACK_TOKEN is set in the environment; unset it (revoke the key at devstack.bid/settings/cli).");
  let revoked = false;
  try { await new Api(a.api, a.token, ctx.fetch).req("POST", "/api/cli/logout"); revoked = true; }
  catch (e) { ctx.io.err(`Warning: server revoke failed: ${(e as Error).message}. Revoke it at devstack.bid/settings/cli.`); }
  clearAuth(ctx.env);
  ctx.io.out(revoked ? "Logged out. Key revoked and local credentials deleted." : "Local credentials deleted.");
}

async function whoami(ctx: Ctx) {
  const r = await api(ctx).req<{ login: string | null; key: string; scopes?: string[] }>("GET", "/api/cli/whoami");
  ctx.io.out(`${r.login ?? "(no login name)"}  key: ${r.key}${r.scopes ? `  scopes: ${r.scopes.join(", ")}` : ""}`);
}

interface TemplateList { starters: { id: string; name: string }[]; templates: { id: string; name: string; summary?: string }[] }

async function templates(ctx: Ctx) {
  const t = await new Api(apiBase(ctx.env), null, ctx.fetch).req<TemplateList>("GET", "/api/cli/templates");
  ctx.io.out("Starters (local files):");
  for (const s of t.starters) ctx.io.out(`  ${s.id.padEnd(22)} ${s.name}`);
  ctx.io.out("Repo templates (creates a GitHub repo in your connected account):");
  for (const s of t.templates) ctx.io.out(`  ${s.id.padEnd(22)} ${s.name}`);
}

async function scaffold(ctx: Ctx, name: string, template: string, dir: string) {
  const res = await api(ctx).req<Response>("POST", "/api/cli/scaffold", { name, template }, { raw: true });
  const files = extractZip(readZip(new Uint8Array(await res.arrayBuffer())), dir);
  ctx.io.out(`Created ${files.length} files in ${dir}`);
}

async function create(ctx: Ctx, pos: string[], flags: Flags) {
  const name = pos[0] ?? (typeof flags.name === "string" ? flags.name : "");
  if (!name) throw new UserError("Usage: devstack create <name> --template <id>");
  const template = typeof flags.template === "string" ? flags.template : "static";
  if (template === "static" || template === "worker") {
    const dir = resolve(ctx.cwd, name);
    if (existsSync(dir)) throw new UserError(`./${name} already exists`);
    await scaffold(ctx, name, template, dir);
    ctx.io.out(`Next: cd ${name} && git init && push to GitHub, then devstack link --repo <owner/name>`);
    return;
  }
  const r = await api(ctx).req<{ project: { id: string; name: string; repo: string | null; slug?: string | null }; url: string }>("POST", "/api/projects", { name, templateId: template, private: true });
  ctx.io.out(`Created GitHub repo ${r.url}`);
  ctx.io.out(`Project id: ${r.project.id}. Clone it, then run devstack link --project ${r.project.id} inside the folder.`);
}

async function init(ctx: Ctx, flags: Flags) {
  const template = typeof flags.template === "string" ? flags.template : "static";
  if (template !== "static" && template !== "worker") throw new UserError("init supports --template static|worker. For repo templates use devstack create.");
  if (readdirSync(ctx.cwd).filter((f) => !f.startsWith(".")).length) throw new UserError("Current folder is not empty. Use devstack create <name> instead.");
  await scaffold(ctx, basename(ctx.cwd).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 63) || "my-app", template, ctx.cwd);
}

interface Project { id: string; name: string; repo: string | null; slug?: string | null; defaultBranch?: string | null }

function gitRemoteRepo(cwd: string): string | null {
  try {
    const u = execFileSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const m = u.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
    return m ? m[1] : null;
  } catch { return null; }
}

async function link(ctx: Ctx, flags: Flags) {
  const a = api(ctx);
  let repo = typeof flags.repo === "string" ? flags.repo : null;
  if (repo) {
    const r = await a.req<{ project: Project; build?: Record<string, unknown> }>("POST", "/api/projects/import", {
      repo, branch: typeof flags.branch === "string" ? flags.branch : undefined, rootDirectory: typeof flags.root === "string" ? flags.root : undefined,
    });
    writeLink(ctx.cwd, { projectId: r.project.id, name: r.project.name, repo: r.project.repo, slug: r.project.slug ?? null });
    ctx.io.out(`Imported ${repo} as project ${r.project.name} and linked this folder.`);
    const b = r.build ?? {};
    if (b.status === "queued") ctx.io.out(`First build queued (deployment ${String(b.deploymentId)}). Watch: devstack logs ${String(b.deploymentId)} --follow`);
    else ctx.io.out(`First build not started: ${String(b.error ?? b.status ?? "unknown")}`);
    return;
  }
  const { projects } = await a.req<{ projects: Project[] }>("GET", "/api/projects");
  if (!projects.length) throw new UserError("No projects yet. Use devstack link --repo <owner/name> to import one.");
  const want = typeof flags.project === "string" ? flags.project : null;
  repo = gitRemoteRepo(ctx.cwd);
  let p = want ? projects.find((x) => x.id === want || x.name === want) : repo ? projects.find((x) => x.repo?.toLowerCase() === repo!.toLowerCase()) : undefined;
  if (want && !p) throw new UserError(`No project named or with id "${want}".`);
  if (!p) {
    if (!ctx.io.isTTY) throw new UserError("Pass --project <id|name> or --repo <owner/name>.");
    projects.forEach((x, i) => ctx.io.out(`  ${String(i + 1).padStart(2)}. ${x.name}${x.repo ? `  (${x.repo})` : ""}`));
    const n = Number(await ctx.io.prompt("Link to which project? "));
    p = projects[n - 1];
    if (!p) throw new UserError("No project selected.");
  }
  writeLink(ctx.cwd, { projectId: p.id, name: p.name, repo: p.repo, slug: p.slug ?? null });
  ctx.io.out(`Linked to ${p.name}${p.repo ? ` (${p.repo})` : ""}.`);
}

interface LogsResp {
  deployment: { id: string; status: string; url: string | null; errorCode: string | null; environment: string };
  job: { status: string; active: boolean; errorCode: string | null } | null;
  events: { seq: number; level: string; phase: string | null; message: string }[];
  next: number;
}

async function streamLogs(ctx: Ctx, a: Api, id: string, follow: boolean): Promise<LogsResp> {
  let after = 0;
  for (;;) {
    const r = await a.req<LogsResp>("GET", `/api/deployments/${encodeURIComponent(id)}/logs?after=${after}`);
    for (const e of r.events) ctx.io.out(redact(`${e.phase ? `[${e.phase}] ` : ""}${e.message}`));
    after = r.next;
    const active = r.job ? r.job.active : ["queued", "building", "deploying", "pending"].includes(r.deployment.status);
    if (!follow || !active) return r;
    await ctx.io.sleep(2000);
  }
}

async function deploy(ctx: Ctx, flags: Flags) {
  const l = needLink(ctx);
  const a = api(ctx);
  if (!l.repo) {
    const { projects } = await a.req<{ projects: Project[] }>("GET", "/api/projects");
    const p = projects.find((x) => x.id === l.projectId);
    if (!p) throw new UserError("Linked project no longer exists. Run devstack link.");
    if (!p.repo) throw new UserError("This project has no GitHub repo. devstack.bid builds from GitHub; local folder upload to *.devstack.bid hosting is not supported by the server yet. Push to GitHub and run devstack link --repo <owner/name>.");
  }
  const environment = flags.prod ? "production" : "preview";
  const r = await a.req<{ deploymentId: string; previewUrl?: string | null; productionUrl?: string | null }>("POST", `/api/projects/${encodeURIComponent(l.projectId)}/builds`, { environment, ref: typeof flags.ref === "string" ? flags.ref : undefined });
  ctx.io.out(`Deploying ${l.name} (${environment}) — deployment ${r.deploymentId}`);
  const final = await streamLogs(ctx, a, r.deploymentId, true);
  const ok = final.job ? final.job.status === "succeeded" || final.job.status === "success" : ["ready", "live", "succeeded"].includes(final.deployment.status);
  const url = final.deployment.url ?? (environment === "production" ? r.productionUrl : r.previewUrl) ?? siteHost(a.base, l.slug);
  if (!ok) throw new UserError(`Deployment ${final.deployment.status}${final.job?.errorCode || final.deployment.errorCode ? ` (${final.job?.errorCode ?? final.deployment.errorCode})` : ""}. See: devstack logs ${r.deploymentId}`);
  ctx.io.out(`\n✔ Ready: ${url ?? "(no URL returned by server)"}`);
}

async function status(ctx: Ctx) {
  const l = needLink(ctx);
  const a = api(ctx);
  const { projects } = await a.req<{ projects: Project[] }>("GET", "/api/projects");
  const p = projects.find((x) => x.id === l.projectId);
  if (!p) throw new UserError("Linked project no longer exists. Run devstack link.");
  ctx.io.out(`Project: ${p.name}${p.repo ? `  repo: ${p.repo}` : ""}${p.slug ? `  url: ${siteHost(a.base, p.slug)}` : ""}`);
  const { deployments } = await a.req<{ deployments: { id: string; status: string; environment: string; url: string | null; createdAt: number; commit: string | null }[] }>("GET", `/api/projects/${encodeURIComponent(p.id)}/deploy`);
  if (!deployments.length) { ctx.io.out("No deployments yet."); return; }
  for (const d of deployments.slice(0, 10)) ctx.io.out(`  ${d.id}  ${d.environment.padEnd(10)} ${d.status.padEnd(10)} ${new Date(d.createdAt).toISOString().slice(0, 16).replace("T", " ")}Z  ${d.url ?? ""}`);
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const { cmd, pos, flags } = parseArgs(argv);
  try {
    if (flags.version || cmd === "version") { ctx.io.out(VERSION); return 0; }
    if (!cmd || flags.help || cmd === "help") { ctx.io.out(HELP); return 0; }
    switch (cmd) {
      case "login": await login(ctx, flags); break;
      case "logout": await logout(ctx); break;
      case "whoami": await whoami(ctx); break;
      case "templates": await templates(ctx); break;
      case "create": await create(ctx, pos, flags); break;
      case "init": await init(ctx, flags); break;
      case "link": await link(ctx, flags); break;
      case "deploy": await deploy(ctx, flags); break;
      case "status": await status(ctx); break;
      case "logs": {
        if (!pos[0]) throw new UserError("Usage: devstack logs <deployment-id> [--follow]");
        const r = await streamLogs(ctx, api(ctx), pos[0], Boolean(flags.follow));
        ctx.io.out(`status: ${r.deployment.status}${r.deployment.url ? `  ${r.deployment.url}` : ""}`);
        break;
      }
      default: ctx.io.err(`Unknown command: ${cmd}\n\n${HELP}`); return 2;
    }
    return 0;
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.message}${e.status ? ` (HTTP ${e.status}${e.code ? `, ${e.code}` : ""})` : ""}` : (e as Error).message;
    ctx.io.err(`Error: ${redact(msg)}`);
    return e instanceof UserError ? 2 : 1;
  }
}

export function nodeIo(): Io {
  return {
    out: (s) => process.stdout.write(s + "\n"),
    err: (s) => process.stderr.write(s + "\n"),
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    openUrl(url) {
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
      try { spawn(cmd, [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref(); } catch { /* user can open manually */ }
    },
    prompt(q, hidden = false) {
      return new Promise((res) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
        if (hidden) (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => { if (s.includes(q)) process.stdout.write(q); };
        rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); res(a); });
      });
    },
  };
}

