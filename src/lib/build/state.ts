/**
 * Build job state machine (pure; no I/O). Spec states:
 * queued → claimed → installing → building → uploading → succeeded
 * any active state → failed | canceled | timed_out. Terminal states never change.
 */
export const BUILD_STATES = ["queued", "claimed", "installing", "building", "uploading", "succeeded", "failed", "canceled", "timed_out"] as const;
export type BuildState = (typeof BUILD_STATES)[number];

export const ACTIVE_STATES: readonly BuildState[] = ["queued", "claimed", "installing", "building", "uploading"];
export const TERMINAL_STATES: readonly BuildState[] = ["succeeded", "failed", "canceled", "timed_out"];

const NEXT: Record<BuildState, readonly BuildState[]> = {
  queued: ["claimed", "canceled", "failed", "timed_out"],
  claimed: ["installing", "building", "uploading", "failed", "canceled", "timed_out"], // direct jobs skip install/build
  installing: ["building", "failed", "canceled", "timed_out"],
  building: ["uploading", "failed", "canceled", "timed_out"],
  uploading: ["succeeded", "failed", "canceled", "timed_out"],
  succeeded: [],
  failed: [],
  canceled: [],
  timed_out: [],
};

export const isBuildState = (s: unknown): s is BuildState => typeof s === "string" && (BUILD_STATES as readonly string[]).includes(s);
export const isTerminal = (s: BuildState) => TERMINAL_STATES.includes(s);
export const isActive = (s: BuildState) => ACTIVE_STATES.includes(s);
export const canTransition = (from: BuildState, to: BuildState) => NEXT[from].includes(to);
export const nextStates = (from: BuildState): readonly BuildState[] => NEXT[from];

/** Per-phase wall-clock limits (ms). A heartbeat older than this marks the job timed_out. */
export const PHASE_TIMEOUT_MS: Record<BuildState, number> = {
  queued: 30 * 60_000, claimed: 2 * 60_000, installing: 10 * 60_000, building: 20 * 60_000, uploading: 5 * 60_000,
  succeeded: 0, failed: 0, canceled: 0, timed_out: 0,
};

/** Map a build state onto the existing deployments.status values (queued|uploading|live|failed) the UI already reads. */
export function deploymentStatusFor(s: BuildState): "queued" | "uploading" | "live" | "failed" {
  if (s === "succeeded") return "live";
  if (s === "failed" || s === "canceled" || s === "timed_out") return "failed";
  if (s === "uploading" || s === "installing" || s === "building") return "uploading";
  return "queued";
}

/* ---------- retry policy ---------- */

/** Transient failures worth retrying. User errors (bad config, auth, missing files) are not. */
export const RETRYABLE_CODES = new Set(["cf_api", "cf_assets", "github", "executor_lost", "timed_out", "network", "internal"]);
export const NON_RETRYABLE_CODES = new Set(["cf_auth", "cf_account_missing", "cf_too_large", "missing_index", "missing_entry", "needs_build", "not_deployable", "too_many_files", "too_large", "build_failed", "install_failed", "canceled", "invalid_config"]);

export function isRetryable(code: string | null | undefined): boolean {
  return !!code && RETRYABLE_CODES.has(code) && !NON_RETRYABLE_CODES.has(code);
}

/** Exponential backoff with full jitter: base·2^(attempt-1), capped. `rand` injectable for tests. */
export function backoffMs(attempt: number, opts: { baseMs?: number; capMs?: number; rand?: () => number } = {}): number {
  const base = opts.baseMs ?? 5_000;
  const cap = opts.capMs ?? 5 * 60_000;
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  return Math.floor((opts.rand ?? Math.random)() * exp);
}

export function shouldRetry(job: { attempt: number; max_attempts: number; cancel_requested?: number }, code: string | null | undefined): boolean {
  return !job.cancel_requested && job.attempt < job.max_attempts && isRetryable(code);
}

/* ---------- idempotency ---------- */

/**
 * Stable key for "the same build request": project + environment + trigger source + commit.
 * Webhook redeliveries and double-clicks map to the same key → one job.
 */
export async function idempotencyKey(parts: { projectId: string; environment: string; commitSha: string | null; source: string }): Promise<string> {
  const raw = [parts.projectId, parts.environment, parts.source, parts.commitSha ?? "-"].join("|");
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
