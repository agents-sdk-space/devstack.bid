import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { startMediaWorkflow, type TriggerEnv } from "./trigger";

/** Queue a welcome (and later inactivity) email when an account is created. No-ops until Email Service is bound. */
export async function scheduleWelcome(plan: { create: boolean; promoteAnon: boolean; userId: string }): Promise<void> {
  if (!plan.create && !plan.promoteAnon) return;
  try {
    const cf = await getCloudflareContext({ async: true });
    const pending = startMediaWorkflow(cf.env as unknown as TriggerEnv, { kind: "lifecycle", userId: plan.userId, event: "welcome" });
    cf.ctx.waitUntil(pending);
  } catch (err) {
    console.warn(JSON.stringify({ at: "lifecycle", event: "unscheduled", name: (err as Error)?.name }));
  }
}
