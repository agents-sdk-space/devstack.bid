import { connection } from "next/server";
import { chatRuntime } from "@/lib/chat/runtime";
import { verifyWebhook } from "@/lib/github/webhook";
import { claimDelivery, handleGitEvent } from "@/lib/github/autodeploy";
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
  const { db, waitUntil } = await chatRuntime();
  if (!db) return Response.json({ ok: false, reason: "unavailable" }, { status: 503 });
  const repoId = (result.payload.repository as { id?: unknown } | undefined)?.id;
  // A redelivery (GitHub "Redeliver") reprocesses a delivery that never finished or failed; done ones stay deduped.
  const ins = await claimDelivery(db, { delivery: result.delivery, event: result.event, installationId: result.installationId, repoId: typeof repoId === "number" ? repoId : null });
  if (!ins) return Response.json({ ok: true, duplicate: true }, { status: 200 });
  const record = (status: string, jobId: string | null) =>
    db.prepare("UPDATE webhook_deliveries SET status = ?2, build_job_id = ?3 WHERE delivery_id = ?1").bind(result.delivery, status.slice(0, 120), jobId).run().catch(() => null);
  let status = "ignored:event";
  if (result.event === "push" || result.event === "pull_request") {
    if (!env.CHAT_COOKIE_SECRET) status = "blocked:no_seal_key";
    else {
      // Answer GitHub at once (10 s delivery timeout); the build work runs after the response.
      status = "processing";
      const secret = env.CHAT_COOKIE_SECRET;
      const ev = result.event;
      const payload = result.payload;
      await record(status, null); // before the background work, so it can never overwrite the final status
      waitUntil((async () => {
        let final = "failed:internal";
        let jobId: string | null = null;
        try {
          const r = await handleGitEvent(db, await resolveSealKeys(secret), await routeBuildBindings(), ev, payload);
          final = r.status;
          jobId = r.buildJobId ?? null;
        } catch { /* recorded as failed:internal */ }
        await record(final, jobId);
        console.log(JSON.stringify({ at: "api/github/webhook", event: ev, status: final }));
      })());
    }
  }
  if (status !== "processing") await record(status, null);
  return Response.json({ ok: true, duplicate: false, status }, { status: 202 });
}
