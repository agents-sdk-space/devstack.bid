export class WorkflowEntrypoint<Env = unknown> {
  ctx: unknown;
  env: Env;
  constructor(ctx?: unknown, env?: Env) {
    this.ctx = ctx;
    this.env = env as Env;
  }
}

export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}
