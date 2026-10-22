import { assertSlugUsable } from "@/lib/projects/slug-gate";
/**
 * AI site builder service: one AI project = a `projects` row (source 'ai') + versioned file snapshots
 * (ai_site_versions) + transcript (ai_site_messages). Each version is published as plain static output through
 * the direct executor (build_jobs executor 'direct' with logged phases) to the SITES bucket, which the separate
 * sites worker serves only on *.devstack.bid. The platform apex never serves generated files.
 */
import type { D1Like } from "@/lib/chat/store";
import { ServiceError } from "@/lib/connections/github-service";
import { appendEvent, createBuildJob, transitionJob, type BuildJobRow } from "@/lib/build/jobs";
import { previewHost, siteSlug } from "@/lib/hosting/hostnames";
import { HostTakenError, promoteProduction, publishPreview, writeSite } from "@/lib/hosting/publish";
import { applyEdits, editContext, FileError, validateSnapshot, type SiteFileText } from "./files";
import type { ModelEdit } from "./llm";
import type { R2BucketLike } from "@/lib/hosting/serve";

export const DAILY_AI_TURNS_PER_USER = 25;
export const MAX_PROMPT_CHARS = 4000;
export const MAX_AI_PROJECTS_PER_USER = 30;

export interface SiteBindings { sites: R2BucketLike | null; dnsReady: boolean }

export interface VersionRow { id: string; project_id: string; version: number; parent: number | null; kind: string; prompt: string | null; summary: string | null; files: string; file_count: number; bytes: number; model: string | null; deployment_id: string | null; created_at: number }

export type PublishResult =
  | { status: "live"; deploymentId: string; jobId: string; url: string; dnsReady: true }
  | { status: "published_dns_blocked"; deploymentId: string; jobId: string; url: string; dnsReady: false; reason: string }
  | { status: "blocked"; reason: string }
  | { status: "failed"; deploymentId: string; jobId: string; reason: string };

async function aiProject(db: D1Like, uid: string, id: string) {
  if (!/^[a-z0-9-]{8,64}$/.test(id)) return null;
  return db.prepare("SELECT id, name, slug FROM projects WHERE id = ?1 AND user_id = ?2 AND source = 'ai'").bind(id, uid).first<{ id: string; name: string; slug: string }>();
}

export async function requireAiProject(db: D1Like, uid: string, id: string) {
  const p = await aiProject(db, uid, id);
  if (!p) throw new ServiceError("invalid", "Not found. / ไม่พบโปรเจกต์", 404);
  return p;
}

export async function aiTurnsToday(db: D1Like, uid: string, now = Date.now()): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM ai_quota WHERE user_id = ?1 AND created_at > ?2").bind(uid, now - 86_400_000).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

/**
 * Atomically reserve one AI turn before calling the model: a single INSERT ... SELECT ... HAVING COUNT(*) < cap,
 * so concurrent requests can never exceed the daily cap. Returns false when the cap is reached.
 * Reservations are not refunded on model errors (a failing upstream call still costs money).
 */
export async function reserveAiTurn(db: D1Like, uid: string, cap = DAILY_AI_TURNS_PER_USER, now = Date.now()): Promise<boolean> {
  const r = await db
    // One statement = atomic in D1/SQLite. (SQLite rejects a bare HAVING without an aggregate in the select list,
    // so the count is a scalar subquery; same semantics as INSERT ... SELECT ... HAVING COUNT(*) < cap.)
    .prepare("INSERT INTO ai_quota (user_id, created_at) SELECT ?1, ?2 WHERE (SELECT COUNT(*) FROM ai_quota WHERE user_id = ?1 AND created_at > ?3) < ?4 RETURNING id")
    .bind(uid, now, now - 86_400_000, cap)
    .first<{ id: number }>();
  return !!r;
}

/** Free slug: base, base-2, base-3 ... (per-user unique index + global host ownership in R2). */
async function freeSlug(db: D1Like, uid: string, base: string, sites: R2BucketLike | null): Promise<string> {
  for (let i = 1; i < 50; i++) {
    const s = i === 1 ? base : `${base.slice(0, 50)}-${i}`;
    if (await slugOk(db, s, sites)) return s;
  }
  return `${base.slice(0, 40)}-${crypto.randomUUID().slice(0, 7)}`;
}

/** Shared slug gate (taken / preview-shaped / R2 host record or tombstone). */
async function slugOk(db: D1Like, slug: string, sites: R2BucketLike | null): Promise<boolean> {
  try { await assertSlugUsable(db, slug, null, sites); return true; } catch (e) { if (e instanceof ServiceError) return false; throw e; }
}

export async function createAiProject(db: D1Like, uid: string, title: string, sites: R2BucketLike | null = null): Promise<{ id: string; name: string; slug: string }> {
  const n = await db.prepare("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?1 AND source = 'ai'").bind(uid).first<{ n: number }>();
  if (Number(n?.n ?? 0) >= MAX_AI_PROJECTS_PER_USER) throw new ServiceError("limit", `AI project limit reached (${MAX_AI_PROJECTS_PER_USER}). / ครบจำนวนโปรเจกต์ AI แล้ว`, 429);
  const base = siteSlug(title) ?? "ai-site";
  // Slugs are globally unique (index projects_slug_global_uq): retry with a fresh suffix if we lose a race.
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt === 0 ? await freeSlug(db, uid, base, sites) : `${base.slice(0, 40)}-${crypto.randomUUID().slice(0, 7)}`;
    if (attempt > 0 && !(await slugOk(db, slug, sites))) continue;
    const id = crypto.randomUUID();
    try {
      await db.prepare("INSERT INTO projects (id, user_id, name, slug, source, framework, output_directory, provider, updated_at) VALUES (?1, ?2, ?3, ?4, 'ai', 'static', '.', 'devstack-sites', ?5)")
        .bind(id, uid, title.slice(0, 60), slug, Date.now()).run();
      return { id, name: title.slice(0, 60), slug };
    } catch (e) {
      if (!/UNIQUE/i.test(String((e as Error)?.message))) throw e;
    }
  }
  throw new ServiceError("conflict", "Could not allocate a site name. Try again. / จองชื่อเว็บไม่สำเร็จ", 409);
}

export async function latestVersion(db: D1Like, projectId: string): Promise<VersionRow | null> {
  return db.prepare("SELECT * FROM ai_site_versions WHERE project_id = ?1 ORDER BY version DESC LIMIT 1").bind(projectId).first<VersionRow>();
}

export async function getVersion(db: D1Like, projectId: string, version: number): Promise<VersionRow | null> {
  return db.prepare("SELECT * FROM ai_site_versions WHERE project_id = ?1 AND version = ?2").bind(projectId, version).first<VersionRow>();
}

export const filesOf = (v: VersionRow | null): SiteFileText[] => (v ? (JSON.parse(v.files) as SiteFileText[]) : []);

export async function addMessage(db: D1Like, p: { projectId: string; uid: string; role: "user" | "assistant" | "error"; content: string; version?: number | null }) {
  await db.prepare("INSERT INTO ai_site_messages (project_id, user_id, role, content, version) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(p.projectId, p.uid, p.role, p.content.slice(0, 4000), p.version ?? null).run();
}

export async function saveVersion(db: D1Like, p: { projectId: string; uid: string; files: SiteFileText[]; kind: "ai" | "revert"; prompt: string | null; summary: string | null; model: string | null; parent: number | null }): Promise<VersionRow> {
  const v = validateSnapshot(p.files);
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await latestVersion(db, p.projectId);
    const next = (cur?.version ?? 0) + 1;
    try {
      const row = await db.prepare("INSERT INTO ai_site_versions (id, project_id, user_id, version, parent, kind, prompt, summary, files, file_count, bytes, model) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12) RETURNING *")
        .bind(crypto.randomUUID(), p.projectId, p.uid, next, p.parent, p.kind, p.prompt?.slice(0, MAX_PROMPT_CHARS) ?? null, p.summary, JSON.stringify(v.files), v.files.length, v.bytes, p.model)
        .first<VersionRow>();
      await db.prepare("UPDATE projects SET updated_at = ?2 WHERE id = ?1").bind(p.projectId, Date.now()).run();
      return row!;
    } catch (e) {
      if (!/UNIQUE/i.test(String((e as Error)?.message))) throw e;
    }
  }
  throw new ServiceError("conflict", "Another edit is in progress. / มีการแก้ไขอื่นอยู่", 409);
}

/** Model output → new snapshot (validated). First turn must be complete files. */
export function nextFiles(current: SiteFileText[], edit: ModelEdit): SiteFileText[] {
  try {
    return applyEdits(current, edit);
  } catch (e) {
    if (e instanceof FileError) throw new ServiceError("invalid", `AI output rejected: ${e.message}`, 422);
    throw e;
  }
}

export const contextFor = (files: SiteFileText[]) => (files.length ? editContext(files) : null);

/**
 * Publish one version as static output. Missing SITES bucket = Blocked (nothing faked).
 * Missing wildcard DNS/route (SITES_DNS_READY != 1) = files published but the URL is reported Blocked.
 */
export async function publishVersion(db: D1Like, b: SiteBindings, uid: string, project: { id: string; slug: string }, v: VersionRow, now = () => Date.now()): Promise<PublishResult> {
  if (!b.sites) return { status: "blocked", reason: "R2 SITES binding is not provisioned in this environment. / ยังไม่ได้เปิดที่เก็บเว็บ (R2 SITES)" };
  const { job } = await createBuildJob(db, { projectId: project.id, userId: uid, executor: "direct", environment: "preview", trigger: "manual", idempotencyKey: `ai-v${v.id}`, maxAttempts: 1, config: { source: "ai", version: v.version } });
  const deploymentId = crypto.randomUUID();
  await db.prepare("INSERT INTO deployments (id, project_id, user_id, ref, target, status, build_job_id, trigger, environment) VALUES (?1, ?2, ?3, ?4, 'devstack-sites', 'uploading', ?5, 'manual', 'preview')")
    .bind(deploymentId, project.id, uid, `ai-v${v.version}`, job.id).run();
  let state = "queued" as BuildJobRow["status"];
  const step = async (to: BuildJobRow["status"], msg: string) => {
    const r = await transitionJob(db, job.id, state, to, {}, now());
    if (r) state = to;
    await appendEvent(db, job.id, { level: "info", phase: to, message: msg });
  };
  try {
    await step("claimed", `Static publish of version ${v.version} (${v.file_count} files, ${v.bytes} bytes). No build step: plain static output.`);
    await step("uploading", "Uploading files to R2 SITES");
    const files = filesOf(v).map((f) => ({ path: f.path, bytes: new TextEncoder().encode(f.content) }));
    await writeSite(b.sites, deploymentId, files);
    const url = await publishPreview(b.sites, project.slug, project.id, deploymentId);
    await step("succeeded", `Preview alias ${previewHost(project.slug, deploymentId)} -> deployment ${deploymentId}`);
    await db.prepare("UPDATE deployments SET status = 'live', url = ?2, finished_at = ?3 WHERE id = ?1").bind(deploymentId, url, now()).run();
    await db.prepare("UPDATE ai_site_versions SET deployment_id = ?2 WHERE id = ?1").bind(v.id, deploymentId).run();
    if (!b.dnsReady) {
      const reason = "Files are published, but the *.devstack.bid route is not marked live (SITES_DNS_READY != 1), so the URL may not resolve yet. / ยังไม่ได้เปิด route *.devstack.bid";
      await appendEvent(db, job.id, { level: "warn", phase: "succeeded", message: reason });
      return { status: "published_dns_blocked", deploymentId, jobId: job.id, url, dnsReady: false, reason };
    }
    return { status: "live", deploymentId, jobId: job.id, url, dnsReady: true };
  } catch (e) {
    const reason = e instanceof HostTakenError ? `Hostname ${e.host} belongs to another project.` : `Publish failed: ${String((e as Error)?.message ?? e).slice(0, 200)}`;
    await appendEvent(db, job.id, { level: "error", phase: state, message: reason }).catch(() => null);
    if (state !== "succeeded") await transitionJob(db, job.id, state, "failed", { error_code: "publish_failed" }, now()).catch(() => null);
    await db.prepare("UPDATE deployments SET status = 'failed', error_code = 'publish_failed', error_log = ?2, finished_at = ?3 WHERE id = ?1").bind(deploymentId, reason, now()).run();
    return { status: "failed", deploymentId, jobId: job.id, reason };
  }
}

export async function promoteVersion(db: D1Like, b: SiteBindings, uid: string, project: { id: string; slug: string }, version: number) {
  if (!b.sites) throw new ServiceError("blocked", "R2 SITES binding is not provisioned. / ยังไม่ได้เปิดที่เก็บเว็บ", 503);
  const v = await getVersion(db, project.id, version);
  if (!v?.deployment_id) throw new ServiceError("invalid", "This version has no published deployment. / เวอร์ชันนี้ยังไม่ได้เผยแพร่", 409);
  try {
    const url = await promoteProduction(b.sites, project.slug, project.id, v.deployment_id);
    // Exactly one production deployment per AI project: the previous one goes back to preview.
    await db.prepare("UPDATE deployments SET alias_url = NULL, environment = 'preview' WHERE project_id = ?1 AND user_id = ?3 AND id != ?2 AND alias_url IS NOT NULL").bind(project.id, v.deployment_id, uid).run();
    await db.prepare("UPDATE deployments SET alias_url = ?2, environment = 'production' WHERE id = ?1 AND user_id = ?3").bind(v.deployment_id, url, uid).run();
    return { url, dnsReady: b.dnsReady, version };
  } catch (e) {
    if (e instanceof HostTakenError) throw new ServiceError("conflict", `Hostname ${e.host} belongs to another project.`, 409);
    throw e;
  }
}

export async function projectState(db: D1Like, uid: string, projectId: string) {
  const p = await requireAiProject(db, uid, projectId);
  const versions = await db.prepare("SELECT v.version, v.kind, v.summary, v.file_count, v.bytes, v.model, v.deployment_id, v.created_at, d.status AS deploy_status, d.url, d.alias_url, d.build_job_id, d.error_log FROM ai_site_versions v LEFT JOIN deployments d ON d.id = v.deployment_id WHERE v.project_id = ?1 ORDER BY v.version DESC LIMIT 100").bind(projectId).all();
  const messages = await db.prepare("SELECT id, role, content, version, created_at FROM ai_site_messages WHERE project_id = ?1 ORDER BY id DESC LIMIT 100").bind(projectId).all();
  const latest = await latestVersion(db, projectId);
  return { project: p, versions: versions.results ?? [], messages: (messages.results ?? []).reverse(), files: filesOf(latest).map((f) => ({ path: f.path, bytes: new TextEncoder().encode(f.content).length })), latest: latest?.version ?? 0 };
}

export async function listAiProjects(db: D1Like, uid: string) {
  const r = await db.prepare("SELECT id, name, slug, updated_at FROM projects WHERE user_id = ?1 AND source = 'ai' ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 50").bind(uid).all();
  return r.results ?? [];
}
