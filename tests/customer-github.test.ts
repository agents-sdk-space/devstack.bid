import { afterEach, describe, expect, it, vi } from "vitest";
import { commitFiles, createRepo, openPullRequest, readFile } from "@/lib/auth/github-api";
import { changeBranchName, LIMITS, safeChangePath, safeRepoName, safeWorkerName, validateChangeSet } from "@/lib/connections/policy";
import { consume, customerRules } from "@/lib/chat/limits";
import { CUSTOMER_GITHUB_TOOLS, CUSTOMER_TOOL_LABELS } from "@/lib/chat/customer-tool-defs";
import { FUNCTION_LABELS } from "@/lib/chat/events";
import type { D1Like } from "@/lib/chat/store";

function counterD1(): D1Like {
  const rows = new Map<string, number>();
  const stmt = (sql: string, a: unknown[] = []) => ({
    bind: (...x: unknown[]) => stmt(sql, x),
    async all() {
      const k = `${a[0]}|${a[1]}`;
      if (sql.startsWith("SELECT")) return { results: rows.has(k) ? [{ count: rows.get(k) }] : [] };
      if (sql.startsWith("INSERT")) rows.set(k, (rows.get(k) ?? 0) + 1);
      return { results: [] };
    },
    async run() { return this.all(); },
    async first() { return ((await this.all()).results?.[0] ?? null) as never; },
  });
  return { prepare: (s: string) => stmt(s) as never, batch: async (s: unknown[]) => Promise.all((s as { all(): Promise<unknown> }[]).map((x) => x.all())) as never };
}

describe("path validation", () => {
  it("blocks .github/workflows, .git and traversal", () => {
    expect(safeChangePath(".github/workflows/ci.yml")).toBeNull();
    expect(safeChangePath(".GitHub/Workflows/x.yml")).toBeNull();
    expect(safeChangePath(".git/config")).toBeNull();
    expect(safeChangePath("a/../b")).toBeNull();
    expect(safeChangePath("/etc/passwd")).toBeNull();
    expect(safeChangePath(".github/dependabot.yml")).toBe(".github/dependabot.yml");
    expect(safeChangePath("src/index.ts")).toBe("src/index.ts");
  });
  it("caps files and bundle size, rejects duplicates", () => {
    expect(validateChangeSet([])).toMatchObject({ ok: false, error: "empty" });
    expect(validateChangeSet(Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => ({ path: `f${i}.txt`, content: "x" })))).toMatchObject({ ok: false, error: "too_many_files" });
    expect(validateChangeSet([{ path: "big.txt", content: "x".repeat(LIMITS.maxBundleBytes + 1) }])).toMatchObject({ ok: false, error: "too_large" });
    expect(validateChangeSet([{ path: "a.txt", content: "1" }, { path: "a.txt", content: "2" }])).toMatchObject({ ok: false, error: "duplicate_path" });
    expect(validateChangeSet([{ path: ".github/workflows/x.yml", content: "1" }])).toMatchObject({ ok: false, error: "bad_path" });
    expect(validateChangeSet([{ path: "a.txt", content: "1" }, { path: "old.txt", delete: true }])).toMatchObject({ ok: true, files: [{ path: "a.txt", content: "1" }, { path: "old.txt", content: null }] });
  });
  it("validates repo, worker and branch names", () => {
    expect(safeRepoName("my-app")).toBe("my-app");
    expect(safeRepoName("../x")).toBeNull();
    expect(safeRepoName("x.git")).toBeNull();
    expect(safeWorkerName("My App!")).toBe("my-app");
    expect(safeWorkerName("---")).toBeNull();
    expect(changeBranchName("Add login page", 0)).toBe("devstack/add-login-page-0");
  });
});

describe("customer rate limits", () => {
  it("5 repos / 30 PRs / 20 deploys per user per day", async () => {
    const db = counterD1();
    const L = { repo: LIMITS.reposPerDay, pr: LIMITS.prsPerDay, deploy: LIMITS.deploysPerDay };
    for (let i = 0; i < 5; i++) expect((await consume(db, customerRules("u1", "repo", L))).ok).toBe(true);
    expect(await consume(db, customerRules("u1", "repo", L))).toMatchObject({ ok: false, exceeded: "repo_user_day" });
    expect((await consume(db, customerRules("u2", "repo", L))).ok).toBe(true);
    for (let i = 0; i < 20; i++) await consume(db, customerRules("u1", "deploy", L));
    expect((await consume(db, customerRules("u1", "deploy", L))).ok).toBe(false);
    expect(customerRules("u1", "pr", L)[0].limit).toBe(30);
  });
});

describe("GitHub Git Data client (mocked fetch)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("commits many files in one commit: ref → commit → blobs → tree → commit → ref", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? "GET";
      calls.push(`${m} ${url.replace("https://api.github.com", "")}`);
      if (url.includes("/git/ref/heads/")) return res({ object: { sha: "head1" } });
      if (url.endsWith("/git/commits/head1")) return res({ tree: { sha: "tree0" } });
      if (url.endsWith("/git/blobs")) return res({ sha: `blob${calls.length}` });
      if (url.endsWith("/git/trees")) {
        const b = JSON.parse(String(init?.body));
        expect(b.base_tree).toBe("tree0");
        expect(b.tree.find((t: { path: string }) => t.path === "gone.txt").sha).toBeNull();
        return res({ sha: "tree1" });
      }
      if (url.endsWith("/git/commits")) return res({ sha: "c1" });
      if (url.includes("/git/refs/heads/")) {
        expect(JSON.parse(String(init?.body))).toEqual({ sha: "c1", force: false });
        return res({});
      }
      return res({}, 500);
    }));
    const r = await commitFiles("tok", { owner: "o", repo: "r", branch: "feat", message: "m", files: [{ path: "a.ts", content: "a" }, { path: "b.ts", content: "ไทย" }, { path: "gone.txt", content: null }] });
    expect(r.sha).toBe("c1");
    expect(calls.filter((c) => c.startsWith("POST") && c.endsWith("/git/blobs"))).toHaveLength(2);
    expect(calls.at(-1)).toBe("PATCH /repos/o/r/git/refs/heads/feat");
  });

  it("createRepo, openPullRequest and readFile map responses; errors are redacted", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/user/repos")) return res({ full_name: "me/app", default_branch: "main", html_url: "https://github.com/me/app" }, 201);
      if (url.endsWith("/pulls")) return res({ number: 7, title: "t", state: "open", html_url: "https://github.com/me/app/pull/7", head: { ref: "h" }, base: { ref: "main" } }, 201);
      if (url.includes("/contents/")) return res({ type: "file", encoding: "base64", content: btoa("hello"), sha: "s" });
      return res({}, 500);
    }));
    expect(await createRepo("tok", { name: "app", private: true })).toEqual({ fullName: "me/app", defaultBranch: "main", htmlUrl: "https://github.com/me/app" });
    expect((await openPullRequest("tok", { owner: "me", repo: "app", head: "h", base: "main", title: "t", body: "" })).number).toBe(7);
    expect(await readFile("tok", "me", "app", "README.md", "main")).toEqual({ content: "hello", sha: "s" });
    vi.stubGlobal("fetch", vi.fn(async () => res({ message: "bad token gho_SECRET123 here" }, 422)));
    await expect(createRepo("gho_SECRET123", { name: "x", private: true })).rejects.toThrow(/^(?!.*gho_SECRET123)/);
  });
});

describe("chat agent GitHub tools", () => {
  it("exposes the full set with activity labels", () => {
    const names = CUSTOMER_GITHUB_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      "apply_fix",
      "get_deploy_logs",
      "github_create_branch",
      "github_create_repo",
      "github_get_pull_request",
      "github_list_pull_requests",
      "github_list_repositories",
      "github_open_pull_request",
      "github_read_file",
      "github_read_tree",
      "github_write_files",
    ]);
    for (const n of names) {
      expect(CUSTOMER_TOOL_LABELS[n]).toBeTruthy();
      expect(FUNCTION_LABELS[n]?.label).toBe(CUSTOMER_TOOL_LABELS[n]);
    }
  });
});

describe("runCustomerTool", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("refuses without a GitHub connection and blocks default-branch / workflow writes", async () => {
    vi.resetModules();
    vi.doMock("@/lib/connections/credentials", () => ({ loadGithubToken: vi.fn().mockResolvedValueOnce(null).mockResolvedValue("tok") }));
    vi.doMock("@/lib/connections/projects", () => ({ findProjectByRepo: vi.fn().mockResolvedValue({ default_branch: "main" }), projectView: (x: unknown) => x }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const { runCustomerTool } = await import("@/lib/chat/customer-tools");
    const ctx = { db: {} as never, uid: "u1", keys: { cookieSecret: "x" } };
    await expect(runCustomerTool("github_read_tree", { repo: "o/r", ref: "main" }, ctx)).rejects.toThrow(/not connected GitHub/);
    await expect(runCustomerTool("github_write_files", { repo: "o/r", branch: "main", message: "m", files: [{ path: "a", content: "1" }] }, ctx)).rejects.toThrow(/default branch/);
    await expect(runCustomerTool("github_write_files", { repo: "o/r", branch: "feat", message: "m", files: [{ path: ".github/workflows/x.yml", content: "1" }] }, ctx)).rejects.toThrow(/bad_path/);
    vi.doUnmock("@/lib/connections/credentials");
    vi.doUnmock("@/lib/connections/projects");
  });
});
