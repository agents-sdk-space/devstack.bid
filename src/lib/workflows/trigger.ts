import { workflowInstanceId, type MediaJob } from "./jobs";

export interface WorkflowBinding {
  create(options: { id: string; params: MediaJob }): Promise<{ id: string }>;
}

/** Bindings the route can see. Missing ones leave the upload stored and skip the job. */
export interface TriggerEnv {
  MEDIA_WORKFLOW?: WorkflowBinding;
  ASSETS_BUCKET?: unknown;
  VECTORIZE?: unknown;
  AI?: unknown;
  EMAIL?: unknown;
  DB?: unknown;
}

export interface TriggerResult {
  started: boolean;
  id?: string;
  reason?: "workflow_unbound" | "index_unbound" | "email_unbound" | "duplicate" | "create_failed";
}

/**
 * Start one durable instance. Instance ids are stable, so a second upload or
 * sign-in does not open a second run. This does not create Cloudflare resources.
 */
export async function startMediaWorkflow(env: TriggerEnv, job: MediaJob): Promise<TriggerResult> {
  if (!env.MEDIA_WORKFLOW) return { started: false, reason: "workflow_unbound" };
  if (job.kind === "upload" && (!env.ASSETS_BUCKET || !env.VECTORIZE || !env.AI || !env.DB)) {
    return { started: false, reason: "index_unbound" };
  }
  if (job.kind === "lifecycle" && (!env.EMAIL || !env.DB)) return { started: false, reason: "email_unbound" };
  const id = workflowInstanceId(job);
  try {
    const instance = await env.MEDIA_WORKFLOW.create({ id, params: job });
    return { started: true, id: instance.id };
  } catch (err) {
    const message = (err as Error)?.message ?? "";
    if (/already exists|instance\.already_exists|duplicate/i.test(message)) return { started: false, id, reason: "duplicate" };
    console.warn(JSON.stringify({ at: "media-workflow", event: "create_failed", name: (err as Error)?.name, kind: job.kind }));
    return { started: false, reason: "create_failed" };
  }
}
