import { beforeAll, describe, expect, it, vi } from "vitest";
import { sqliteD1 } from "./helpers/sqlite-d1";

const db = sqliteD1();
process.env.CHAT_COOKIE_SECRET = "test-cookie-secret-that-is-long-enough-0123456789";
vi.mock("@/lib/chat/runtime", async (orig) => ({ ...(await orig<object>()), chatRuntime: async () => ({ db, waitUntil: () => undefined }) }));

const { hashMcpKey } = await import("@/lib/mcp/auth");
const { callTool, MCP_TOOLS } = await import("@/lib/mcp/server");

const KEY_A = "nvx_live_" + "A".repeat(43);
const KEY_A_READONLY = "nvx_live_" + "R".repeat(43);
const KEY_B = "nvx_live_" + "B".repeat(43);
const KEY_CLI = "nvx_live_" + "C".repeat(43);
const req = (key?: string) => new Request("https://devstack.bid/mcp", { method: "POST", headers: key ? { authorization: `Bearer ${key}` } : {} });

beforeAll(async () => {
  db.raw.exec(`INSERT INTO users (id, login, auth_provider, auth_subject) VALUES ('userA','alice','github','1'),('userB','bob','github','2');
    INSERT INTO projects (id, user_id, name, repo_full_name, default_branch, slug) VALUES ('proja-0001','userA','Alpha','alice/alpha','main','alpha'),('projb-0001','userB','Beta','bob/beta','main','beta');
    INSERT INTO deployments (id, project_id, user_id, ref, target, status, environment) VALUES ('depa-0001','proja-0001','userA','main','devstack-sites','queued','preview');`);
  const add = async (id: string, uid: string, key: string, scopes: string[]) =>
    db.raw.prepare("INSERT INTO api_clients (id, user_id, name, key_hash, scopes) VALUES (?, ?, ?, ?, ?)").run(id, uid, id, await hashMcpKey(key), JSON.stringify(scopes));
  await add("ka", "userA", KEY_A, ["projects:read", "projects:write", "deploy:write"]);
  await add("kr", "userA", KEY_A_READONLY, ["projects:read"]);
  await add("kb", "userB", KEY_B, ["projects:read", "deploy:write"]);
  await add("kc", "userA", KEY_CLI, ["cli:setup", "cli:deploy"]);
});

describe("MCP platform tools", () => {
  it("are listed with scopes, and destructive tools are annotated", () => {
    const byName = Object.fromEntries(MCP_TOOLS.map((t) => [t.name, t]));
    for (const n of ["list_projects", "get_project", "create_project", "list_deployments", "get_deployment", "get_deployment_logs", "trigger_deploy", "cancel_deployment", "list_project_templates"]) expect(byName[n]?.requiredScope).toBeTruthy();
    expect(byName.trigger_deploy.annotations?.destructiveHint).toBe(true);
    expect(byName.cancel_deployment.annotations?.destructiveHint).toBe(true);
    expect(byName.list_projects.annotations?.readOnlyHint).toBe(true);
  });

  it("require a key, reject CLI keys and missing scopes", async () => {
    expect((await callTool(req(), "list_projects", {})).isError).toBe(true);
    expect((await callTool(req(KEY_CLI), "list_projects", {})).structuredContent).toMatchObject({ code: "missing_scope" });
    expect((await callTool(req(KEY_A_READONLY), "trigger_deploy", { projectId: "proja-0001" })).structuredContent).toMatchObject({ code: "missing_scope" });
  });

  it("only return the key owner's projects and deployments", async () => {
    const a = await callTool(req(KEY_A), "list_projects", {});
    expect((a.structuredContent as { id: string }[]).map((p) => p.id)).toEqual(["proja-0001"]);
    expect((await callTool(req(KEY_B), "get_project", { projectId: "proja-0001" })).structuredContent).toMatchObject({ code: "not_found" });
    expect((await callTool(req(KEY_B), "get_deployment_logs", { deploymentId: "depa-0001" })).structuredContent).toMatchObject({ code: "not_found" });
    const own = await callTool(req(KEY_A_READONLY), "get_deployment", { deploymentId: "depa-0001" });
    expect(own.structuredContent).toMatchObject({ deployment: { id: "depa-0001", status: "queued" } });
    const logs = await callTool(req(KEY_A), "get_deployment_logs", { deploymentId: "depa-0001" });
    expect(logs.structuredContent).toMatchObject({ events: [], next: 0 });
  });

  it("require explicit confirmation for production deploys and cancellation", async () => {
    expect((await callTool(req(KEY_A), "trigger_deploy", { projectId: "proja-0001", environment: "production" })).structuredContent).toMatchObject({ code: "confirmation_required" });
    expect((await callTool(req(KEY_A), "cancel_deployment", { deploymentId: "depa-0001", confirm: "yes" })).structuredContent).toMatchObject({ code: "confirmation_required" });
    expect((await callTool(req(KEY_B), "cancel_deployment", { deploymentId: "depa-0001", confirm: "depa-0001" })).isError).toBe(true);
    const ok = await callTool(req(KEY_A), "cancel_deployment", { deploymentId: "depa-0001", confirm: "depa-0001" });
    // Confirmed calls reach the real cancel service (this legacy row has no build job, so it reports a conflict).
    expect(ok.structuredContent).toMatchObject({ code: "conflict" });
  });

  it("reports missing build infrastructure instead of faking a deploy", async () => {
    const r = await callTool(req(KEY_A), "trigger_deploy", { projectId: "proja-0001" });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({ code: "blocked" });
  });

  it("lists seedable project templates", async () => {
    const r = await callTool(req(KEY_A_READONLY), "list_project_templates", {});
    expect((r.structuredContent as { id: string }[]).map((t) => t.id)).toContain("static-website");
  });
});
