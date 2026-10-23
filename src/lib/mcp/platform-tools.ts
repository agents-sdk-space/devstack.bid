import "server-only";
import { KNOWN_TEMPLATE_IDS } from "@/data/template-ids";
import { TEMPLATES } from "@/data/templates";
import { routeBuildBindings } from "@/lib/build/bindings";
import { startContainerBuild } from "@/lib/build/executor";
import { getJob, jobView, listEvents } from "@/lib/build/jobs";
import { audit } from "@/lib/connections/audit";
import { loadGithubToken, resolveSealKeys } from "@/lib/connections/credentials";
import { createProjectRepo, serviceErrorBody } from "@/lib/connections/github-service";
import { getProject, listProjects, projectView } from "@/lib/connections/projects";
import { cancelDeployment, deploymentView, getDeployment, listDeployments } from "@/lib/deploy/service";
import { templateSeedFiles } from "@/lib/projects/template-seed";
import { getAccount, type D1Like } from "@/lib/chat/store";
import type { McpClient, McpScope } from "./auth";

/**
 * DevStack platform tools (projects, deploys, logs). Thin MCP adapters over the same service functions the
 * /api/projects and /api/deployments routes call; every query is scoped to the API key owner's uid.
 */
type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: McpScope;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
};

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const s = (description: string) => ({ type: "string", description });

export const PLATFORM_TOOLS: ToolDef[] = [
  { name: "list_project_templates", description: "List the template ids that create_project can seed a new GitHub repository from.", inputSchema: obj({}), requiredScope: "projects:read", annotations: { readOnlyHint: true } },
  { name: "list_projects", description: "List your DevStack projects (sites). Requires projects:read; only this key owner's projects are returned.", inputSchema: obj({}), requiredScope: "projects:read", annotations: { readOnlyHint: true } },
  { name: "get_project", description: "Read one of your projects with its recent deployments. Requires projects:read.", inputSchema: obj({ projectId: s("Project id from list_projects") }, ["projectId"]), requiredScope: "projects:read", annotations: { readOnlyHint: true } },
  { name: "create_project", description: "Create a new GitHub repository in your linked GitHub account and register it as a DevStack project, optionally seeded from a template. Creates a real repo and counts toward the daily project quota. Requires projects:write and a GitHub-linked account; ask the user first.", inputSchema: obj({ name: s("Repository/project name"), templateId: { type: "string", enum: [...KNOWN_TEMPLATE_IDS] }, description: s("Optional repository description"), private: { type: "boolean", description: "Private repository (default true)" } }, ["name"]), requiredScope: "projects:write", annotations: { openWorldHint: true } },
  { name: "list_deployments", description: "List a project's deployment timeline. Requires projects:read.", inputSchema: obj({ projectId: s("Project id") }, ["projectId"]), requiredScope: "projects:read", annotations: { readOnlyHint: true } },
  { name: "get_deployment", description: "Read one deployment's status, URL and build job. Requires projects:read.", inputSchema: obj({ deploymentId: s("Deployment id") }, ["deploymentId"]), requiredScope: "projects:read", annotations: { readOnlyHint: true } },
  { name: "get_deployment_logs", description: "Read redacted build log lines after a sequence number (resumable; pass the returned `next`). Requires projects:read.", inputSchema: obj({ deploymentId: s("Deployment id"), after: { type: "integer", minimum: 0 } }, ["deploymentId"]), requiredScope: "projects:read", annotations: { readOnlyHint: true } },
  { name: "trigger_deploy", description: "Start a container build and deploy for a project. Defaults to a preview deploy. DESTRUCTIVE when environment is \"production\": it replaces the live site, so the call must also pass confirm: \"deploy-production\" after the user explicitly approves. Requires deploy:write; counts toward build quotas.", inputSchema: obj({ projectId: s("Project id"), ref: s("Branch to build; defaults to the production branch"), environment: { type: "string", enum: ["preview", "production"] }, confirm: s("Must be exactly \"deploy-production\" for production deploys") }, ["projectId"]), requiredScope: "deploy:write", annotations: { destructiveHint: true, openWorldHint: true } },
  { name: "cancel_deployment", description: "DESTRUCTIVE: cancel a queued or running deployment. Requires deploy:write and confirm equal to the deployment id after the user approves.", inputSchema: obj({ deploymentId: s("Deployment id"), confirm: s("Repeat the deployment id to confirm") }, ["deploymentId", "confirm"]), requiredScope: "deploy:write", annotations: { destructiveHint: true, idempotentHint: true } },
];

export const PLATFORM_TOOL_NAMES = new Set(PLATFORM_TOOLS.map((t) => t.name));

type Out = { ok: true; data: unknown } | { ok: false; code: string; error: string };
const fail = (code: string, error: string): Out => ({ ok: false, code, error });
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

async function sealKeys(secret: string | undefined) {
  if (!secret) throw Object.assign(new Error("Server is not configured."), { status: 503 });
  return resolveSealKeys(secret);
}

export async function runPlatformTool(name: string, args: Record<string, unknown>, client: McpClient, db: D1Like, cookieSecret: string | undefined): Promise<Out> {
  const uid = client.userId;
  const account = await getAccount(db, uid).catch(() => null);
  if (!account) return fail("account_required", "This key's account no longer exists.");
  try {
    switch (name) {
      case "list_project_templates":
        return { ok: true, data: KNOWN_TEMPLATE_IDS.map((id) => { const t = TEMPLATES.find((x) => x.id === id); return { id, name: t?.name ?? id, summary: t?.summary ?? null }; }) };
      case "list_projects":
        return { ok: true, data: (await listProjects(db, uid)).map(projectView) };
      case "get_project": {
        const p = await getProject(db, uid, str(args.projectId));
        if (!p) return fail("not_found", "Project not found.");
        return { ok: true, data: { project: projectView(p), deployments: (await listDeployments(db, uid, p.id)).slice(0, 10).map(deploymentView) } };
      }
      case "list_deployments": {
        const p = await getProject(db, uid, str(args.projectId));
        if (!p) return fail("not_found", "Project not found.");
        return { ok: true, data: (await listDeployments(db, uid, p.id)).map(deploymentView) };
      }
      case "get_deployment": {
        const d = await getDeployment(db, uid, str(args.deploymentId));
        if (!d) return fail("not_found", "Deployment not found.");
        const job = d.build_job_id ? await getJob(db, uid, d.build_job_id) : null;
        return { ok: true, data: { deployment: deploymentView(d), job: job ? jobView(job) : null } };
      }
      case "get_deployment_logs": {
        const d = await getDeployment(db, uid, str(args.deploymentId));
        if (!d) return fail("not_found", "Deployment not found.");
        const after = Math.max(0, Math.floor(Number(args.after ?? 0)) || 0);
        const job = d.build_job_id ? await getJob(db, uid, d.build_job_id) : null;
        const events = job ? await listEvents(db, uid, job.id, after, 500) : [];
        return { ok: true, data: { deployment: deploymentView(d), job: job ? jobView(job) : null, events, next: events.length ? events[events.length - 1].seq : after } };
      }
      case "create_project": {
        if (account.provider !== "github") return fail("github_required", "Sign in to DevStack with GitHub to create projects.");
        const projectName = str(args.name);
        if (!projectName) return fail("invalid", "name is required.");
        const templateId = typeof args.templateId === "string" && (KNOWN_TEMPLATE_IDS as readonly string[]).includes(args.templateId) ? args.templateId : null;
        if (args.templateId !== undefined && !templateId) return fail("invalid", "Unknown templateId; call list_project_templates.");
        const keys = await sealKeys(cookieSecret);
        const token = await loadGithubToken(db, keys, uid);
        if (!token) return fail("reauth", "Reconnect GitHub in DevStack first.");
        const description = typeof args.description === "string" ? args.description.slice(0, 300) : undefined;
        const files = templateId ? templateSeedFiles(templateId, projectName, description) : undefined;
        const r = await createProjectRepo(db, token, uid, { name: projectName, private: args.private !== false, templateId, description, files }, (await routeBuildBindings()).sites);
        return { ok: true, data: { project: projectView(r.project), url: r.htmlUrl, commit: r.commit ?? null } };
      }
      case "trigger_deploy": {
        const environment = args.environment === "production" ? "production" : "preview";
        if (environment === "production" && args.confirm !== "deploy-production") return fail("confirmation_required", "Production deploys replace the live site. Ask the user, then call again with confirm: \"deploy-production\".");
        const p = await getProject(db, uid, str(args.projectId));
        if (!p) return fail("not_found", "Project not found.");
        const r = await startContainerBuild(db, await sealKeys(cookieSecret), await routeBuildBindings(), uid, p, { ref: str(args.ref) || null, environment, trigger: "redeploy" });
        await audit(db, uid, "build.started", `${p.repo_full_name}@${r.job.ref}`);
        return { ok: true, data: { job: jobView(r.job), deploymentId: r.deploymentId, previewUrl: r.previewUrl, productionUrl: r.productionUrl } };
      }
      case "cancel_deployment": {
        const id = str(args.deploymentId);
        if (!id || args.confirm !== id) return fail("confirmation_required", "Ask the user, then pass confirm equal to the deployment id.");
        const r = await cancelDeployment(db, uid, id);
        await audit(db, uid, "deploy.cancel", id);
        return { ok: true, data: { deployment: deploymentView(r.deployment), job: r.job ? jobView(r.job) : null } };
      }
      default:
        return fail("unknown_tool", `Unknown DevStack tool: ${name}`);
    }
  } catch (err) {
    if ((err as { status?: number }).status === 503 && (err as Error).message === "Server is not configured.") return fail("unavailable", "DevStack is not configured for this operation.");
    const e = serviceErrorBody(err);
    return fail(e.body.code, e.body.error);
  }
}
