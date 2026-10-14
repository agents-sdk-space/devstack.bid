/** Minimal types so the Workflow class typechecks without regenerating wrangler runtime types. */

interface WorkflowEvent<T = unknown> {
  payload: T;
  instanceId: string;
  timestamp: Date;
}

interface WorkflowStepConfig {
  retries?: { limit: number; delay: string | number; backoff?: "constant" | "linear" | "exponential" };
  timeout?: string | number;
}

interface WorkflowStep {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
  do<T>(name: string, config: WorkflowStepConfig, callback: () => Promise<T>): Promise<T>;
  sleep(name: string, duration: string | number): Promise<void>;
}

declare module "cloudflare:workers" {
  export class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    env: Env;
    ctx: ExecutionContext;
    run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
  }
  export class NonRetryableError extends Error {
    constructor(message: string);
  }
  export type { WorkflowEvent, WorkflowStep, WorkflowStepConfig };
}
