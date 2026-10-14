/**
 * Payloads for MediaLifecycleWorkflow. The server never executes uploaded bytes.
 * Text is extracted and embedded; lifecycle mail is transactional and addressed
 * only to the email stored for that user in D1.
 */

export const EMBED_MODEL = "@cf/baai/bge-m3";
export const EMBED_DIMS = 1024;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const DEFAULT_EMAIL_FROM = "DevStack <noreply@devstack.bid>";
export const DEFAULT_FOLLOWUP = "7 days";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/(plain|markdown|csv)|application\/json)$/;
const FOLLOWUP = /^([1-9]\d?) (seconds|minutes|hours|days|weeks)$/;

export type UploadJob = {
  kind: "upload";
  userId: string;
  attachmentId: string;
  key: string;
  mime: string;
  size: number;
};

export type LifecycleJob = {
  kind: "lifecycle";
  userId: string;
  event: "welcome";
};

export type MediaJob = UploadJob | LifecycleJob;

export class PermanentWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentWorkflowError";
  }
}

export function objectKey(userId: string, attachmentId: string): string {
  return `u/${userId}/pending/${attachmentId}`;
}

export function workflowInstanceId(job: MediaJob): string {
  if (job.kind === "upload") return `upload_${job.attachmentId}`;
  return `life_${job.userId}_welcome`;
}

export function parseJob(input: unknown): MediaJob {
  if (!input || typeof input !== "object") throw new PermanentWorkflowError("job payload is missing");
  const kind = (input as { kind?: unknown }).kind;
  if (kind === "upload") return parseUpload(input as Record<string, unknown>);
  if (kind === "lifecycle") return parseLifecycle(input as Record<string, unknown>);
  throw new PermanentWorkflowError("job kind is not supported");
}

function parseUpload(raw: Record<string, unknown>): UploadJob {
  const userId = requiredId(raw.userId, "userId");
  const attachmentId = requiredId(raw.attachmentId, "attachmentId");
  const mime = typeof raw.mime === "string" ? raw.mime : "";
  const size = typeof raw.size === "number" ? raw.size : -1;
  const key = typeof raw.key === "string" ? raw.key : "";
  if (!MIME.test(mime)) throw new PermanentWorkflowError("file type is not supported");
  if (!Number.isInteger(size) || size < 0 || size > MAX_UPLOAD_BYTES) throw new PermanentWorkflowError("file size is not allowed");
  if (key !== objectKey(userId, attachmentId)) throw new PermanentWorkflowError("object key does not match the owner");
  return { kind: "upload", userId, attachmentId, key, mime, size };
}

function parseLifecycle(raw: Record<string, unknown>): LifecycleJob {
  const userId = requiredId(raw.userId, "userId");
  if (raw.event !== "welcome") throw new PermanentWorkflowError("lifecycle event is not supported");
  return { kind: "lifecycle", userId, event: "welcome" };
}

function requiredId(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new PermanentWorkflowError(`${label} is not a valid id`);
  return value;
}

/** Sender must be on the devstack.bid domain onboarded to Email Service. */
export function senderAddress(raw: string | undefined): { email: string; name: string } {
  const value = (raw ?? "").trim();
  const named = value.match(/^([^<>]{0,40})<([^@\s<>]+@devstack\.bid)>$/);
  if (named) return { name: named[1].trim() || "DevStack", email: named[2] };
  if (/^[^@\s<>]+@devstack\.bid$/.test(value)) return { name: "DevStack", email: value };
  const fallback = DEFAULT_EMAIL_FROM.match(/^([^<>]*)<([^>]+)>$/);
  return { name: fallback?.[1].trim() || "DevStack", email: fallback?.[2] ?? "noreply@devstack.bid" };
}

export function followUpDuration(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return FOLLOWUP.test(value) ? value : DEFAULT_FOLLOWUP;
}
