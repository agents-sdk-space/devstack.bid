/**
 * Build jobs in D1 (migration 0015). Every transition is a conditional UPDATE ... WHERE status = <from>
 * RETURNING, so two workers can never both move the same job (optimistic concurrency).
 * No executor exists yet (Milestone 2 infra pending owner approval); these functions are the contract it will use.
 */
import type { D1Like } from "@/lib/chat/store";
import { ServiceError } from "@/lib/connections/github-service";
import { sanitizeLog, shortSecrets } from "@/lib/deploy/sanitize";
import { backoffMs, canTransition, isActive, isTerminal, PHASE_TIMEOUT_MS, shouldRetry, ACTIVE_STATES, type BuildState } from "./state";

export type Executor = "direct" | "cf-container" | "workers-builds";
export type Trigger = "manual" | "push" | "pr" | "redeploy" | "rollback" | "retry";
export type Environment = "preview" | "production";

export interface BuildJobRow {
  id: string;
  project_id: string;
  user_id: string;
  commit_sha: string | null;
  ref: string | null;
  environment: Environment;
  trigger: Trigger;
  status: BuildState;
  executor: Executor;
  attempt: number;
  max_attempts: number;
  retry_of: string | null;
  idempotency_key: string | null;
  config_snapshot: string;
  artifact_key: string | null;
  error_code: string | null;
  cancel_requested: number;
  next_attempt_at: number | null;
  requeue_count?: number;
  heartbeat_at: number | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export interface NewJob {
  projectId: string;
  userId: string;
  environment?: Environment;
  trigger?: Trigger;
  commitSha?: string | null;
  ref?: string | null;
  executor: Executor;
  /** Build settings only (framework/commands). Secrets are rejected. */
  config?: Record<string, unknown>;
  idempotencyKey?: string | null;
  maxAttempts?: number;
  attempt?: number;
  retryOf?: string | null;
  notBefore?: number | null;
}

const SECRETISH_KEY = /(secret|token|password|api[_-]?key|private)/i;

export function snapshotConfig(config: Record<string, unknown> = {}): string {
  for (const k of Object.keys(config)) if (SECRETISH_KEY.test(k)) throw new ServiceError("invalid", `config_snapshot must not contain secrets (${k}).`, 400);
  const s = JSON.stringify(config);
  if (s.length > 4000) throw new ServiceError("invalid", "Build config too large.", 400);
  return s;
}

const errText = (e: unknown) => String((e as Error)?.message ?? e);
/** SQLite/D1 report the violated columns: idempotency index vs the one-active-per-environment index. */
const isIdemViolation = (e: unknown) => /UNIQUE/i.test(errText(e)) && /idempotency_key/.test(errText(e));
const isActiveViolation = (e: unknown) => /UNIQUE/i.test(errText(e)) && /environment/.test(errText(e));

export async function getJob(db: D1Like, uid: string, id: string): Promise<BuildJobRow | null> {
  if (!/^[a-z0-9-]{8,64}$/.test(id)) return null;
  return db.prepare("SELECT * FROM build_jobs WHERE id = ?1 AND user_id = ?2").bind(id, uid).first<BuildJobRow>();
}

async function byIdem(db: D1Like, projectId: string, key: string) {
  return db.prepare("SELECT * FROM build_jobs WHERE project_id = ?1 AND idempotency_key = ?2").bind(projectId, key).first<BuildJobRow>();
}

/**
 * Create a queued job. Idempotent: the same (project, idempotency key) returns the existing job with created=false.
 * One active job per project+environment (unique partial index) → 409 conflict.
 */
export async function createBuildJob(db: D1Like, j: NewJob): Promise<{ job: BuildJobRow; created: boolean }> {
  const key = j.idempotencyKey ?? null;
  if (key) {
    const existing = await byIdem(db, j.projectId, key);
    if (existing) return { job: existing, created: false };
  }
  const id = crypto.randomUUID();
  const config = snapshotConfig(j.config);
  try {
    const row = await db
      .prepare(
        "INSERT INTO build_jobs (id, project_id, user_id, commit_sha, ref, environment, trigger, status, executor, attempt, max_attempts, retry_of, idempotency_key, config_snapshot, next_attempt_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'queued', ?8, ?9, ?10, ?11, ?12, ?13, ?14) RETURNING *"
      )
      .bind(id, j.projectId, j.userId, j.commitSha ?? null, j.ref ?? null, j.environment ?? "preview", j.trigger ?? "manual", j.executor, j.attempt ?? 1, Math.min(Math.max(j.maxAttempts ?? 3, 1), 5), j.retryOf ?? null, key, config, j.notBefore ?? null)
      .first<BuildJobRow>();
    return { job: row!, created: true };
  } catch (e) {
    // Lost a race on the idempotency key: return the winner.
    if (key && isIdemViolation(e)) {
      const existing = await byIdem(db, j.projectId, key);
      if (existing) return { job: existing, created: false };
    }
    if (isActiveViolation(e)) throw new ServiceError("conflict", "A build is already running for this project and environment. / มี build กำลังทำงานอยู่", 409);
    throw e;
  }
}

/** Move a job from `from` to `to`. Returns the updated row, or null if another writer moved it first. */
export async function transitionJob(
  db: D1Like,
  id: string,
  from: BuildState,
  to: BuildState,
  patch: { error_code?: string | null; artifact_key?: string | null; commit_sha?: string | null } = {},
  now = Date.now()
): Promise<BuildJobRow | null> {
  if (!canTransition(from, to)) throw new Error(`illegal build transition ${from} → ${to}`);
  const sets = ["status = ?3", "heartbeat_at = ?4"];
  const vals: unknown[] = [id, from, to, now];
  if (to === "claimed") sets.push("started_at = ?4");
  if (isTerminal(to)) sets.push("finished_at = ?4");
  for (const k of ["error_code", "artifact_key", "commit_sha"] as const) {
    if (patch[k] !== undefined) { vals.push(patch[k]); sets.push(`${k} = ?${vals.length}`); }
  }
  return db.prepare(`UPDATE build_jobs SET ${sets.join(", ")} WHERE id = ?1 AND status = ?2 RETURNING *`).bind(...vals).first<BuildJobRow>();
}

/** Executor liveness ping; also tells the executor whether a cancel was requested. */
export async function heartbeat(db: D1Like, id: string, now = Date.now()): Promise<{ cancel: boolean } | null> {
  const r = await db.prepare("UPDATE build_jobs SET heartbeat_at = ?2 WHERE id = ?1 AND status IN ('claimed','installing','building','uploading') RETURNING cancel_requested").bind(id, now).first<{ cancel_requested: number }>();
  return r ? { cancel: r.cancel_requested === 1 } : null;
}

/**
 * Owner-initiated cancel. Queued → canceled immediately. Running → cancel_requested=1; the executor
 * stops at its next heartbeat and calls finishCanceled. Terminal → unchanged (idempotent).
 */
export async function requestCancel(db: D1Like, uid: string, id: string, now = Date.now()): Promise<BuildJobRow> {
  const job = await getJob(db, uid, id);
  if (!job) throw new ServiceError("invalid", "Build not found. / ไม่พบ build", 404);
  if (isTerminal(job.status)) return job;
  if (job.status === "queued") {
    const r = await transitionJob(db, id, "queued", "canceled", { error_code: "canceled" }, now);
    if (r) return r;
  }
  const r = await db.prepare("UPDATE build_jobs SET cancel_requested = 1 WHERE id = ?1 AND user_id = ?2 RETURNING *").bind(id, uid).first<BuildJobRow>();
  return r ?? job;
}

/** Executor acknowledges a cancel request. */
export async function finishCanceled(db: D1Like, id: string, from: BuildState, now = Date.now()) {
  return transitionJob(db, id, from, "canceled", { error_code: "canceled" }, now);
}

/**
 * Fail a job; if the error is transient and attempts remain, enqueue a retry (attempt+1, backoff via next_attempt_at).
 * The retry has no idempotency key (the original keeps it), so redelivered webhooks still resolve to the original.
 */
export async function failJob(
  db: D1Like,
  id: string,
  from: BuildState,
  code: string,
  now = Date.now(),
  rand: () => number = Math.random
): Promise<{ failed: BuildJobRow | null; retry: BuildJobRow | null }> {
  const failed = await transitionJob(db, id, from, code === "timed_out" ? "timed_out" : "failed", { error_code: code }, now);
  if (!failed || !shouldRetry(failed, code)) return { failed, retry: null };
  const { job } = await createBuildJob(db, {
    projectId: failed.project_id, userId: failed.user_id, environment: failed.environment, trigger: "retry", commitSha: failed.commit_sha, ref: failed.ref,
    executor: failed.executor, config: JSON.parse(failed.config_snapshot || "{}"), attempt: failed.attempt + 1, maxAttempts: failed.max_attempts,
    retryOf: failed.retry_of ?? failed.id, notBefore: now + backoffMs(failed.attempt, { rand }),
  });
  return { failed, retry: job };
}

/** Mark active jobs whose last heartbeat is older than their phase timeout as timed_out (cron/queue sweeper). */
export async function sweepTimeouts(db: D1Like, now = Date.now()): Promise<string[]> {
  const out: string[] = [];
  for (const s of ACTIVE_STATES) {
    const cutoff = now - PHASE_TIMEOUT_MS[s];
    const rows = await db.prepare("SELECT id FROM build_jobs WHERE status = ?1 AND COALESCE(heartbeat_at, created_at) < ?2 LIMIT 50").bind(s, cutoff).all<{ id: string }>();
    for (const r of rows.results ?? []) {
      const res = await failJob(db, r.id, s, "timed_out", now);
      if (res.failed) out.push(r.id);
    }
  }
  return out;
}

/* ---------- logs ---------- */

export type LogLevel = "debug" | "info" | "warn" | "error";
export const MAX_EVENTS_PER_JOB = 5000;

/**
 * Append one redacted log line. `secrets` = every plaintext the executor holds (tokens, env values);
 * sanitizeLog removes them verbatim plus token-shaped strings. seq is assigned atomically in SQL.
 */
export type EventPhase = BuildState | "requeued";

export async function appendEvent(db: D1Like, jobId: string, e: { level?: LogLevel; phase?: EventPhase | null; message: string }, secrets: (string | null | undefined)[] = []): Promise<number | null> {
  const msg = sanitizeLog(e.message, secrets, 2000);
  const r = await db
    .prepare(
      "INSERT INTO build_events (build_job_id, seq, level, phase, message) SELECT ?1, COALESCE(MAX(seq), 0) + 1, ?2, ?3, ?4 FROM build_events WHERE build_job_id = ?1 HAVING COALESCE(MAX(seq), 0) < ?5 RETURNING seq"
    )
    .bind(jobId, e.level ?? "info", e.phase ?? null, msg, MAX_EVENTS_PER_JOB)
    .first<{ seq: number }>();
  return r?.seq ?? null;
}

/**
 * Line-buffered log writer for streamed build output. Raw chunks are held until a newline so a
 * secret split across two chunks is still whole when sanitizeLog sees it. Lines over `maxLine`
 * are cut only after redaction. Warns once when some secrets are too short to redact.
 */
export function createLogStream(
  sink: (line: { level: LogLevel; phase: BuildState | null; message: string }) => Promise<unknown>,
  opts: { secrets: (string | null | undefined)[]; phase?: BuildState | null; maxBuffer?: number }
) {
  let buf = "";
  let phase: BuildState | null = opts.phase ?? null;
  const maxBuffer = opts.maxBuffer ?? 64_000;
  const all: string[] = [];
  const emit = async (raw: string, level: LogLevel = "info") => {
    const message = sanitizeLog(raw.replace(/\r$/, ""), opts.secrets, 2000);
    all.push(message);
    await sink({ level, phase, message });
  };
  const warned = (async () => {
    const n = shortSecrets(opts.secrets);
    if (n > 0) await emit(`${n} environment value(s) are shorter than 6 characters and cannot be redacted from logs; avoid printing them.`, "warn");
  })();
  return {
    setPhase(p: BuildState) { phase = p; },
    async write(chunk: string) {
      await warned;
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.trim()) await emit(line);
      }
      // A runaway line without newlines: redact the whole buffer before cutting it.
      if (buf.length > maxBuffer) { const line = buf; buf = ""; await emit(line); }
    },
    async line(message: string, level: LogLevel = "info") { await warned; await emit(message, level); },
    async flush() { await warned; if (buf.trim()) { const line = buf; buf = ""; await emit(line); } buf = ""; },
    /** Redacted transcript (for the R2 log object). */
    transcript: () => all.join("\n") + "\n",
  };
}

/** Owner-scoped log tail (poll with `after` = last seq seen). */
export async function listEvents(db: D1Like, uid: string, jobId: string, after = 0, limit = 200) {
  const r = await db
    .prepare("SELECT e.seq, e.level, e.phase, e.message, e.created_at FROM build_events e JOIN build_jobs j ON j.id = e.build_job_id WHERE e.build_job_id = ?1 AND j.user_id = ?2 AND e.seq > ?3 ORDER BY e.seq LIMIT ?4")
    .bind(jobId, uid, Math.max(0, after), Math.min(Math.max(limit, 1), 500))
    .all<{ seq: number; level: LogLevel; phase: string | null; message: string; created_at: number }>();
  return r.results ?? [];
}

export const jobView = (j: BuildJobRow) => ({
  id: j.id, projectId: j.project_id, status: j.status, active: isActive(j.status), environment: j.environment, trigger: j.trigger,
  commit: j.commit_sha, ref: j.ref, executor: j.executor, attempt: j.attempt, maxAttempts: j.max_attempts, retryOf: j.retry_of,
  errorCode: j.error_code, cancelRequested: j.cancel_requested === 1, nextAttemptAt: j.next_attempt_at,
  createdAt: j.created_at, startedAt: j.started_at, finishedAt: j.finished_at,
});
