import { lifecycleMail } from "./email-copy";
import {
  EMBED_DIMS,
  EMBED_MODEL,
  PermanentWorkflowError,
  followUpDuration,
  parseJob,
  senderAddress,
  type MediaJob,
  type UploadJob,
} from "./jobs";
import type { MediaStore } from "./store";
import { chunkText, extractUploadText } from "./text";

const IO = { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" as const }, timeout: "2 minutes" };
const BATCH = 8;

export interface StepConfig {
  retries?: { limit: number; delay: string; backoff?: "constant" | "linear" | "exponential" };
  timeout?: string;
}

export interface StepLike {
  do<T>(name: string, configOrFn: StepConfig | (() => Promise<T>), maybeFn?: () => Promise<T>): Promise<T>;
  sleep(name: string, duration: string): Promise<void>;
}

export interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface VectorRow {
  id: string;
  values: number[];
  metadata: Record<string, string | number>;
}

export interface MediaEnv {
  ASSETS_BUCKET?: { get(key: string): Promise<R2ObjectBody | null> };
  AI?: { run(model: string, input: { text: string[] }): Promise<unknown> };
  VECTORIZE?: { upsert(vectors: VectorRow[]): Promise<unknown> };
  EMAIL?: { send(message: { to: string; from: { email: string; name?: string }; subject: string; html?: string; text?: string }): Promise<{ messageId: string }> };
  DB?: unknown;
  EMAIL_FROM?: string;
  LIFECYCLE_FOLLOWUP?: string;
  store?: MediaStore;
}

export type MediaResult =
  | { kind: "upload"; status: "indexed"; chunks: number; ids: string[] }
  | { kind: "upload"; status: "skipped"; reason: string }
  | { kind: "lifecycle"; status: "sent" | "skipped" | "already_sent"; welcome?: string; inactive?: string; reason?: string };

export async function runMediaLifecycle(step: StepLike, env: MediaEnv, raw: unknown, storeFor?: (env: MediaEnv) => MediaStore): Promise<MediaResult> {
  const job = await step.do("parse-job", async () => parseJob(raw));
  const store = env.store ?? storeFor?.(env);
  if (!store) throw new PermanentWorkflowError("database store is not configured");
  if (job.kind === "upload") return indexUpload(step, env, store, job);
  return sendLifecycle(step, env, store, job);
}

async function indexUpload(step: StepLike, env: MediaEnv, store: MediaStore, job: UploadJob): Promise<MediaResult> {
  await step.do("record-upload", IO, async () => {
    await store.recordUpload({ id: job.attachmentId, userId: job.userId, key: job.key, mime: job.mime, size: job.size });
    return { id: job.attachmentId };
  });

  const extracted = await step.do("read-object", IO, async () => {
    if (!env.ASSETS_BUCKET) throw new PermanentWorkflowError("object storage is not bound");
    const object = await env.ASSETS_BUCKET.get(job.key);
    if (!object) throw new Error("object missing");
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength > 10 * 1024 * 1024) throw new PermanentWorkflowError("object is too large");
    const text = extractUploadText(job.mime, bytes);
    if ("skip" in text) return { skip: text.skip, chunks: [] as string[] };
    return { skip: null as string | null, chunks: chunkText(text.text) };
  });

  if (extracted.skip || extracted.chunks.length === 0) {
    const reason = extracted.skip ?? "empty";
    await step.do("mark-skipped", IO, async () => {
      await store.markUpload(job.attachmentId, "skipped", 0, reason);
      return reason;
    });
    return { kind: "upload", status: "skipped", reason };
  }

  const ids = await step.do("embed-upsert", IO, async () => {
    if (!env.AI || !env.VECTORIZE) throw new PermanentWorkflowError("embedding bindings are not configured");
    const vectors: VectorRow[] = [];
    for (let i = 0; i < extracted.chunks.length; i += BATCH) {
      const batch = extracted.chunks.slice(i, i + BATCH);
      const embedded = vectorsFromModel(await env.AI.run(EMBED_MODEL, { text: batch }), EMBED_DIMS);
      if (embedded.length !== batch.length) throw new Error("embedding count");
      embedded.forEach((values, offset) => {
        const index = i + offset;
        vectors.push({
          id: `${job.attachmentId}:${index}`,
          values,
          metadata: { userId: job.userId, attachmentId: job.attachmentId, chunk: index, mime: job.mime },
        });
      });
    }
    await env.VECTORIZE.upsert(vectors);
    return vectors.map((row) => row.id);
  });

  await step.do("mark-indexed", IO, async () => {
    await store.markUpload(job.attachmentId, "indexed", ids.length, null);
    return ids.length;
  });
  return { kind: "upload", status: "indexed", chunks: ids.length, ids };
}

async function sendLifecycle(step: StepLike, env: MediaEnv, store: MediaStore, job: MediaJob & { kind: "lifecycle" }): Promise<MediaResult> {
  const recipient = await step.do("load-recipient", IO, async () => store.userEmail(job.userId));
  if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    return { kind: "lifecycle", status: "skipped", reason: "no_email" };
  }

  const startedAt = await step.do("clock", async () => Date.now());
  const welcomeId = await deliver(step, env, store, job.userId, "welcome", recipient, "send-welcome");
  await step.sleep("wait-for-return", followUpDuration(env.LIFECYCLE_FOLLOWUP));
  const active = await step.do("check-activity", IO, async () => store.activeSince(job.userId, startedAt));
  if (active) return { kind: "lifecycle", status: welcomeId ? "sent" : "already_sent", welcome: welcomeId, reason: "active" };
  const inactiveId = await deliver(step, env, store, job.userId, "inactive", recipient, "send-inactive");
  if (!welcomeId && !inactiveId) return { kind: "lifecycle", status: "already_sent" };
  return { kind: "lifecycle", status: "sent", welcome: welcomeId, inactive: inactiveId };
}

async function deliver(
  step: StepLike,
  env: MediaEnv,
  store: MediaStore,
  userId: string,
  event: "welcome" | "inactive",
  recipient: string,
  stepName: string
): Promise<string | undefined> {
  const claim = await step.do(`claim-${event}`, IO, async () => store.claimMail(userId, event));
  if (claim === "sent") return undefined;
  const messageId = await step.do(stepName, IO, async () => {
    if (!env.EMAIL) throw new PermanentWorkflowError("email binding is not configured");
    const message = lifecycleMail(event, recipient, senderAddress(env.EMAIL_FROM));
    const sent = await env.EMAIL.send(message);
    if (!sent?.messageId) throw new Error("email was not accepted");
    return sent.messageId;
  });
  await step.do(`record-${event}`, IO, async () => {
    await store.markMailSent(userId, event, messageId);
    return messageId;
  });
  return messageId;
}

export function vectorsFromModel(raw: unknown, width: number): number[][] {
  const data = raw && typeof raw === "object" ? (raw as { data?: unknown }).data : undefined;
  if (!Array.isArray(data) || data.length === 0) throw new Error("empty embedding");
  if (typeof data[0] === "number") {
    const flat = data as number[];
    if (flat.length % width !== 0) throw new Error("embedding width");
    const rows: number[][] = [];
    for (let i = 0; i < flat.length; i += width) rows.push(flat.slice(i, i + width));
    return rows;
  }
  return data.map((row) => {
    if (!Array.isArray(row) || row.length !== width || row.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      throw new Error("embedding width");
    }
    return row as number[];
  });
}
