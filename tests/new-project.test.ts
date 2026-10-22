// New Project platform (Milestone 1): unit + security tests. D1 = real SQLite with the real migrations.
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { sqliteD1 } from "./helpers/sqlite-d1";
import { getProject, listProjects } from "@/lib/connections/projects";
import { ServiceError } from "@/lib/connections/github-service";
import { candidateRoots, detectFramework, underRoot, validateBuildConfig, validateOutputDirectory, validateRootDirectory, validateSlug } from "@/lib/projects/config";
import { importRepo, inspectRepo, type GithubReader } from "@/lib/projects/import";
import { GithubApiError } from "@/lib/auth/github-api";
import { isSymlinkEntry, parseDeployZip, UploadError } from "@/lib/deploy/upload";

const tree = (paths: string[]) => ({ entries: paths.map((path) => ({ path, type: "blob", sha: "a".repeat(40), size: 10 })), truncated: false });

/** Recorded-shape GitHub reader (tests only; production uses the real REST client). */
function reader(opts: { paths?: string[]; pkg?: object | null; status?: number; private?: boolean } = {}): GithubReader {
  const fail = () => { if (opts.status) throw new GithubApiError("x", opts.status); };
  return {
    async getRepoMeta(_t, owner, repo) { fail(); return { id: 4242, fullName: `${owner}/${repo}`, private: opts.private ?? true, defaultBranch: "main" }; },
    async listBranches() { fail(); return ["main", "dev"]; },
    async readTree() { fail(); return tree(opts.paths ?? ["package.json", "next.config.ts", "apps/web/package.json", "apps/web/vite.config.ts"]) as never; },
    async readFile(_t, _o, _r, path) { return path.endsWith("package.json") && opts.pkg !== null ? { content: JSON.stringify(opts.pkg ?? {}), sha: "b" } : null; },
  };
}

function seedUsers(db: ReturnType<typeof sqliteD1>) { db.raw.exec("INSERT INTO users (id) VALUES ('userA'), ('userB')"); }

describe("validateSlug", () => {
  it("normalizes to Worker-name rules", () => {
    expect(validateSlug("My App_2")).toEqual({ ok: true, slug: "my-app-2" });
    expect(validateSlug("a".repeat(70))).toMatchObject({ ok: true });
  });
  it("rejects empty, junk and reserved names", () => {
    expect(validateSlug("").ok).toBe(false);
    expect(validateSlug("---").ok).toBe(false);
    expect(validateSlug("new").ok).toBe(false);
    expect(validateSlug(42).ok).toBe(false);
  });
});

describe("detectFramework", () => {
  it("detects frameworks from config files and dependencies", () => {
    expect(detectFramework(["package.json", "next.config.mjs"]).id).toBe("nextjs");
    expect(detectFramework(["package.json"], { dependencies: { astro: "5" } }).id).toBe("astro");
    expect(detectFramework(["package.json", "svelte.config.js"]).id).toBe("sveltekit");
    expect(detectFramework(["package.json"], { devDependencies: { "@react-router/dev": "7" } }).id).toBe("react-router");
    expect(detectFramework(["package.json", "vite.config.ts"]).id).toBe("vite");
    expect(detectFramework(["index.html", "style.css"]).id).toBe("static");
    expect(detectFramework(["src/index.js"]).id).toBe("worker");
    expect(detectFramework(["package.json"]).id).toBe("node");
    expect(detectFramework(["main.py"]).id).toBe("unknown");
  });
  it("finds monorepo roots and scopes paths", () => {
    const paths = ["package.json", "apps/web/package.json", "apps/site/index.html", "node_modules/x/package.json", "a/b/c/d/package.json"];
    expect(candidateRoots(paths)).toEqual(["", "apps/site", "apps/web"]);
    expect(underRoot(["apps/web/vite.config.ts", "x"], "apps/web")).toEqual(["vite.config.ts"]);
  });
});

describe("validateBuildConfig", () => {
  it("fills presets and accepts safe commands", () => {
    const r = validateBuildConfig({ framework: "vite" });
    expect(r).toMatchObject({ ok: true, config: { framework: "vite", installCommand: "npm ci", buildCommand: "npm run build", outputDirectory: "dist", nodeVersion: "22" } });
    expect(validateBuildConfig({ framework: "nextjs", outputDirectory: ".open-next", buildCommand: "pnpm build" }).ok).toBe(true);
  });
  it("rejects command injection, traversal and unknown node versions", () => {
    for (const buildCommand of ["npm run build; curl evil", "npm run build && rm -rf /", "$(id)", "`id`", "a | b", "a\nb"]) expect(validateBuildConfig({ buildCommand })).toMatchObject({ ok: false, field: "buildCommand" });
    expect(validateBuildConfig({ outputDirectory: "../etc" })).toMatchObject({ ok: false, field: "outputDirectory" });
    expect(validateBuildConfig({ outputDirectory: "/abs" })).toMatchObject({ ok: false });
    expect(validateBuildConfig({ nodeVersion: "16" })).toMatchObject({ ok: false, field: "nodeVersion" });
  });
  it("validates root and output directories", () => {
    expect(validateRootDirectory("apps/web/")).toBe("apps/web");
    expect(validateRootDirectory("./")).toBe("");
    for (const bad of ["../x", "a/../b", "/etc", "a\\b", ".git", "a/.env"]) expect(validateRootDirectory(bad)).toBeNull();
    expect(validateOutputDirectory(".svelte-kit/cloudflare")).toBe(".svelte-kit/cloudflare");
    expect(validateOutputDirectory("a/../../b")).toBeNull();
  });
});

describe("importRepo (real SQLite + migrations 0001–0014)", () => {
  it("persists project + connection without copying the repo", async () => {
    const db = sqliteD1(); seedUsers(db);
    const p = await importRepo(db, "tok", "userA", { repo: "acme/web", branch: "dev", rootDirectory: "apps/web", build: { framework: "vite" } }, reader());
    expect(p).toMatchObject({ repo_full_name: "acme/web", default_branch: "dev", root_directory: "apps/web", framework: "vite", source: "github_import", slug: "web" });
    const conn = db.raw.prepare("SELECT * FROM project_connections WHERE project_id = ?").get(p.id) as Record<string, unknown>;
    expect(conn).toMatchObject({ user_id: "userA", provider: "github", repo_id: 4242, private: 1 });
    expect((await getProject(db, "userA", p.id))?.build_command).toBe("npm run build");
  });
  it("rejects duplicates and slug collisions; allows another root of the same repo", async () => {
    const db = sqliteD1(); seedUsers(db);
    await importRepo(db, "t", "userA", { repo: "acme/web" }, reader());
    await expect(importRepo(db, "t", "userA", { repo: "acme/web" }, reader())).rejects.toMatchObject({ code: "conflict" });
    await expect(importRepo(db, "t", "userA", { repo: "other/web" }, reader())).rejects.toMatchObject({ code: "conflict" });
    await expect(importRepo(db, "t", "userA", { repo: "acme/web", rootDirectory: "apps/web", name: "web-app" }, reader())).resolves.toBeTruthy();
  });
  it("fails on missing root, bad branch and bad repo name before writing", async () => {
    const db = sqliteD1(); seedUsers(db);
    await expect(importRepo(db, "t", "userA", { repo: "acme/web", rootDirectory: "nope" }, reader())).rejects.toMatchObject({ status: 422 });
    await expect(importRepo(db, "t", "userA", { repo: "acme/web", branch: "bad..ref" }, reader())).rejects.toBeInstanceOf(ServiceError);
    await expect(importRepo(db, "t", "userA", { repo: "../../etc" }, reader())).rejects.toMatchObject({ code: "invalid" });
    expect(await listProjects(db, "userA")).toHaveLength(0);
  });
  it("maps GitHub 401 → reauth (expired) and 403/404 → permission guidance", async () => {
    const db = sqliteD1(); seedUsers(db);
    await expect(importRepo(db, "t", "userA", { repo: "acme/web" }, reader({ status: 401 }))).rejects.toMatchObject({ code: "reauth", status: 401 });
    await expect(importRepo(db, "t", "userA", { repo: "acme/private" }, reader({ status: 404 }))).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(inspectRepo("t", { repo: "acme/x" }, reader({ status: 403 }))).rejects.toMatchObject({ code: "forbidden" });
  });
  it("inspect returns branches, roots and detected framework for the chosen root", async () => {
    const r = await inspectRepo("t", { repo: "acme/web", root: "apps/web" }, reader({ pkg: { devDependencies: { vite: "7" } } }));
    expect(r).toMatchObject({ ref: "main", branches: ["main", "dev"], roots: ["", "apps/web"], root: "apps/web", framework: { id: "vite" } });
  });
});

describe("security: account isolation", () => {
  it("account B cannot read, list or collide with account A's project", async () => {
    const db = sqliteD1(); seedUsers(db);
    const a = await importRepo(db, "t", "userA", { repo: "acme/web" }, reader());
    expect(await getProject(db, "userB", a.id)).toBeNull();
    expect(await listProjects(db, "userB")).toHaveLength(0);
    // Same repo + same slug is fine for a different account (slug unique per user only).
    const b = await importRepo(db, "t", "userB", { repo: "acme/web" }, reader());
    expect(b.id).not.toBe(a.id);
    expect((await listProjects(db, "userA")).map((p) => p.id)).toEqual([a.id]);
  });
  it("D1 enforces per-user slug uniqueness even if the code check is bypassed", () => {
    const db = sqliteD1(); seedUsers(db);
    db.raw.exec("INSERT INTO projects (id, user_id, name, slug) VALUES ('p1', 'userA', 'x', 'x')");
    expect(() => db.raw.exec("INSERT INTO projects (id, user_id, name, slug) VALUES ('p2', 'userA', 'x', 'x')")).toThrow(/UNIQUE/);
  });
});

describe("security: malicious zip uploads", () => {
  it("rejects symlink entries", async () => {
    const zip = new JSZip();
    zip.file("index.html", "<h1>x</h1>");
    zip.file("link", "/etc/passwd", { unixPermissions: 0o120777 });
    const bytes = await zip.generateAsync({ type: "uint8array", platform: "UNIX" });
    await expect(parseDeployZip(bytes)).rejects.toMatchObject({ code: "symlink" });
    expect(isSymlinkEntry({ unixPermissions: 0o100644 })).toBe(false);
    expect(isSymlinkEntry({ unixPermissions: null })).toBe(false);
  });
  it("neutralizes path traversal (never yields a path outside the project)", async () => {
    const zip = new JSZip();
    zip.file("index.html", "x");
    zip.file("../../evil.js", "x");
    const out = await parseDeployZip(await zip.generateAsync({ type: "uint8array" })).catch((e: unknown) => e);
    if (out instanceof UploadError) expect(out.code).toBe("bad_path");
    else for (const f of (out as { files: { path: string }[] }).files) expect(f.path.split("/")).not.toContain("..");
  });
});
