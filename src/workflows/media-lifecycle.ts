import { NonRetryableError, WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { PermanentWorkflowError } from "../lib/workflows/jobs";
import { runMediaLifecycle, type MediaEnv, type StepConfig, type StepLike } from "../lib/workflows/run";
import { d1MediaStore } from "../lib/workflows/store";
import type { D1Like } from "../lib/chat/store";

/**
 * Durable job for two products that share one binding:
 * an R2 upload is read, embedded with Workers AI, and upserted into Vectorize;
 * a new account receives a welcome email and, after the quiet period, an inactivity note.
 * Uploaded bytes are data. This class does not spawn a shell or eval them.
 */
export class MediaLifecycleWorkflow extends WorkflowEntrypoint<MediaEnv & { DB?: D1Like }> {
  async run(event: WorkflowEvent<unknown>, step: WorkflowStep) {
    return runMediaLifecycle(guard(step), this.env, event.payload, (env) => {
      if (!env.DB) throw new PermanentWorkflowError("database is not bound");
      return d1MediaStore(env.DB as D1Like);
    });
  }
}

function guard(step: WorkflowStep): StepLike {
  return {
    async do<T>(name: string, configOrFn: StepConfig | (() => Promise<T>), maybeFn?: () => Promise<T>): Promise<T> {
      const exec = async () => {
        try {
          const fn = typeof configOrFn === "function" ? configOrFn : maybeFn;
          if (!fn) throw new PermanentWorkflowError("missing step");
          return await fn();
        } catch (err) {
          if (err instanceof PermanentWorkflowError) throw new NonRetryableError(err.message);
          throw err;
        }
      };
      if (typeof configOrFn === "function") return step.do(name, exec);
      return step.do(name, configOrFn, exec);
    },
    sleep(name, duration) {
      return step.sleep(name, duration);
    },
  };
}
