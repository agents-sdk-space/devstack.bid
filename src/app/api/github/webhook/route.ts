import { connection } from "next/server";
import { chatRuntime } from "@/lib/chat/runtime";
import { verifyWebhook } from "@/lib/github/webhook";
import { handleGitEvent } from "@/lib/github/autodeploy";
import { routeBuildBindings } from "@/lib/build/bindings";
import { resolveSealKeys } from "@/lib/connections/credentials";

/**
 * POST /api/github/webhook — GitHub App deliveries. Verified and recorded (idempotent on
 * X-GitHub-Delivery). push / pull_request on a linked repo start a production or preview build
 * (see lib/github/autodeploy). Unlinked repos and fork PRs are ignored.
 * Never logs the body or the signature.
 */
export async function POST(req: Request) {
  await connection();
  const env = process.env as Record<string, string | undefined>;
  const result = await verifyWebhook(req, async (installationId) => {
    // Per-installation secret: GITHUB_APP_WEBHOOK_SECRET_<installationId> overrides the app-wide secret.
    if (installationId !== null) {
      const own = env[`GITHUB_APP_WEBHOOK_SECRET_${installationId}`];
      if (own) return own;
    }
    return env.GITHUB_APP_WEBHOOK_SECRET ?? null;
  });
  if (!result.ok) {
    console.warn(JSON.stringify({ at: "api/github/webhook", event: "rejected", reason: result.reason }));
    return Response.json({ ok: false, reason: result.reason }, { status: result.status });
  }
  const { db } = await chatRuntime();
  if (!db) return Response.json({ ok: false, reason: "unavailable" }, { status: 503 });
  const repoId = (result.payload.repository as { id?: unknown } | undefined)?.id;
  const ins = await db
    .prepare("INSERT INTO webhook_deliveries (delivery_id, provider, event, installation_id, repo_id, signature_ok, status) VALUES (?1, 'github', ?2, ?3, ?4, 1, 'received') ON CONFLICT (delivery_id) DO NOTHING RETURNING delivery_id")
    .bind(result.delivery, result.event, result.installationId, typeof repoId === "number" ? repoId : null)
    .first<{ delivery_id: string }>();
  if (!ins) return Response.json({ ok: true, duplicate: true }, { status: 200 });
  let status = "ignored:event";
  let jobId: string | null = null;
  if ((result.event === "push" || result.event === "pull_request") && !env.CHAT_COOKIE_SECRET) status = "blocked:no_seal_key";
  else if (result.event === "push" || result.event === "pull_request") {
    try {
      const r = await handleGitEvent(db, await resolveSealKeys(env.CHAT_COOKIE_SECRET!), await routeBuildBindings(), result.event, result.payload);
      status = r.status;
      jobId = r.buildJobId ?? null;
    } catch {
      status = "failed:internal";
    }
  }
  await db.prepare("UPDATE webhook_deliveries SET status = ?2, build_job_id = ?3 WHERE delivery_id = ?1").bind(result.delivery, status.slice(0, 60), jobId).run().catch(() => null);
  console.log(JSON.stringify({ at: "api/github/webhook", event: result.event, status }));
  return Response.json({ ok: true, duplicate: false, status }, { status: 202 });
}
