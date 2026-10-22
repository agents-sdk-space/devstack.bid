import { connection } from "next/server";
import { chatRuntime } from "@/lib/chat/runtime";
import { verifyWebhook } from "@/lib/github/webhook";

/**
 * POST /api/github/webhook — GitHub App deliveries. Verified and recorded (idempotent on
 * X-GitHub-Delivery). Builds from push events start once the GitHub App exists (Milestone 5).
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
  return Response.json({ ok: true, duplicate: !ins });
}
