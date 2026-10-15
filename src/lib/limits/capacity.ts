/**
 * Per-user limits DERIVED from real platform capacity (see docs/limits.md for sources).
 * Every input is a published platform number; every output is computed, never hand-picked.
 * Override any input or output with an env var (DEVSTACK_LIMIT_*), e.g. when the plan changes.
 */

type Env = Record<string, string | undefined>;

/** Published platform numbers (checked 2026-10-15). */
export const PLATFORM = {
  /** GitHub REST: authenticated user token, primary limit. */
  githubRequestsPerHour: 5000,
  /** GitHub REST secondary limit: content-creating requests per hour (80/min burst). */
  githubContentCreatesPerHour: 500,
  githubContentCreatesPerMinute: 80,
  /** Cloudflare API global limit per user/token. */
  cloudflareRequestsPer5Min: 1200,
  /** Workers subrequests per invocation: free 50, paid 1000 (our direct deploy runs inside our Worker). */
  workersSubrequests: { free: 50, paid: 1000 },
  /** Worker script size after compression: free 3 MB, paid 10 MB. */
  workersScriptBytes: { free: 3 * 1024 * 1024, paid: 10 * 1024 * 1024 },
  /** D1 rows written per day: free 100k; paid 50M/month ≈ 1.6M/day. */
  d1RowsWrittenPerDay: { free: 100_000, paid: 1_600_000 },
} as const;

export interface CapacityLimits {
  reposPerDay: number;
  prsPerDay: number;
  deploysPerDay: number;
  maxFixAttempts: number;
  maxFiles: number;
  maxBundleBytes: number;
  cliScaffoldsPerDay: number;
}

const num = (env: Env, key: string): number | null => {
  const v = env[key];
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

export function deriveLimits(env: Env = {}): CapacityLimits {
  const plan = env.DEVSTACK_WORKERS_PLAN === "free" ? "free" : "paid";
  const d1 = env.DEVSTACK_D1_PLAN === "paid" ? "paid" : "free";
  const safety = Math.min(1, Math.max(0.1, Number(env.DEVSTACK_LIMIT_SAFETY ?? 0.8) || 0.8));
  const activeUsers = num(env, "DEVSTACK_EXPECTED_DAILY_USERS") ?? 100;

  // Files per direct deploy: each file = 1 GitHub blob read subrequest; keep ~25% headroom for API calls.
  const maxFiles = num(env, "DEVSTACK_LIMIT_MAX_FILES") ?? Math.min(200, Math.floor(PLATFORM.workersSubrequests[plan] * 0.75) - 1);
  const maxBundleBytes = num(env, "DEVSTACK_LIMIT_MAX_BUNDLE_BYTES") ?? PLATFORM.workersScriptBytes[plan];

  // GitHub: worst-case seed/PR commit = 1 blob per file + tree + commit + ref + (repo|PR) = files + 4 content creates.
  const opCost = maxFiles + 4;
  const ghOpsPerDay = Math.floor(((PLATFORM.githubContentCreatesPerHour * 24) / opCost) * safety);
  const reposPerDay = num(env, "DEVSTACK_LIMIT_REPOS_PER_DAY") ?? Math.max(1, Math.floor(ghOpsPerDay * 0.25));
  const prsPerDay = num(env, "DEVSTACK_LIMIT_PRS_PER_DAY") ?? Math.max(1, Math.floor(ghOpsPerDay * 0.75));

  // Cloudflare: worst-case deploy = session + 1 upload per file + script PUT + subdomain = files + 3 calls.
  const cfDeploysPer5Min = Math.max(1, Math.floor((PLATFORM.cloudflareRequestsPer5Min / (maxFiles + 3)) * safety));
  // Our D1: a deploy writes ~6 rows (deployment insert + 3 status updates + 2 audit); deploys may use half the daily write budget.
  const d1DeploysPerUser = Math.floor((PLATFORM.d1RowsWrittenPerDay[d1] * 0.5 * safety) / 6 / activeUsers);
  const deploysPerDay = num(env, "DEVSTACK_LIMIT_DEPLOYS_PER_DAY") ?? Math.max(1, Math.min(d1DeploysPerUser, cfDeploysPer5Min * 12 * 24));
  // Self-heal retries must fit in one Cloudflare 5-minute window together with the first attempt.
  const maxFixAttempts = num(env, "DEVSTACK_LIMIT_MAX_FIX_ATTEMPTS") ?? Math.max(1, Math.min(5, cfDeploysPer5Min - 1));
  // CLI scaffold: no GitHub/Cloudflare calls; ~2 D1 writes (usage counter + audit) from 10% of the write budget.
  const cliScaffoldsPerDay = num(env, "DEVSTACK_LIMIT_CLI_PER_DAY") ?? Math.max(1, Math.min(200, Math.floor((PLATFORM.d1RowsWrittenPerDay[d1] * 0.1 * safety) / 2 / activeUsers)));

  return { reposPerDay, prsPerDay, deploysPerDay, maxFixAttempts, maxFiles, maxBundleBytes, cliScaffoldsPerDay };
}

const runtimeEnv: Env = typeof process !== "undefined" && process.env ? (process.env as Env) : {};
export const CAPACITY: CapacityLimits = deriveLimits(runtimeEnv);
