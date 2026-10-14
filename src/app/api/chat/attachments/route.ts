import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveActor } from "@/lib/chat/identity";
import { chatEnv, chatRuntime, json } from "@/lib/chat/runtime";
import { newId } from "@/lib/chat/store";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { startMediaWorkflow, type TriggerEnv } from "@/lib/workflows/trigger";

/**
 * POST /api/chat/attachments  (raw body = the file; headers Content-Type, Content-Length,
 * X-File-Name optional). Max MAX_ATTACHMENT_BYTES (default 10 MB) → 413 above that.
 *
 * Uploads need the R2 binding ASSETS_BUCKET. R2 is not enabled on the account yet, so this route
 * answers 503 `uploads_disabled` after the size check; the UI keeps the attach button disabled.
 * When the bucket exists the file is stored at u/<uid>/pending/<id> and its id is returned
 * (linking it to a message is done by the turn route in a later release).
 * If MEDIA_WORKFLOW, VECTORIZE and AI are bound, the upload starts MediaLifecycleWorkflow,
 * which embeds the text into Vectorize. The HTTP response does not wait for that job.
 */

interface R2Like {
  put(key: string, value: ReadableStream | ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}

const ALLOWED = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/(plain|markdown|csv)|application\/json)$/;

export async function POST(req: Request) {
  const env = chatEnv();
  const max = env.MAX_ATTACHMENT_BYTES;
  const mb = Math.round((max / 1024 / 1024) * 10) / 10;
  const tooBig = () => json({ error: `File is too large (max ${mb} MB). / ไฟล์ใหญ่เกินไป (สูงสุด ${mb} MB)`, code: "too_large", maxBytes: max }, 413);

  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return tooBig();
  if (!req.headers.get("content-length")) return json({ error: "Content-Length is required. / ต้องระบุขนาดไฟล์", code: "length_required" }, 411);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED.test(type)) return json({ error: "This file type isn't supported. / ไม่รองรับไฟล์ประเภทนี้", code: "unsupported_type" }, 415);

  const ip = clientIp(req);
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", ip, env.CHAT_BURST_PER_MIN);
  if (!burst.ok) return json({ error: "Too many uploads — wait a minute. / อัปโหลดถี่เกินไป กรุณารอสักครู่", code: "rate_limited" }, 429, { "Retry-After": "60" });

  let cf: { env: TriggerEnv & { ASSETS_BUCKET?: R2Like }; ctx: { waitUntil(p: Promise<unknown>): void } } | undefined;
  try {
    cf = (await getCloudflareContext({ async: true })) as unknown as { env: TriggerEnv & { ASSETS_BUCKET?: R2Like }; ctx: { waitUntil(p: Promise<unknown>): void } };
  } catch {
    cf = undefined;
  }
  const bucket = cf?.env.ASSETS_BUCKET;
  if (!bucket) {
    return json(
      { error: "File uploads aren't available yet (storage is being set up). / ยังอัปโหลดไฟล์ไม่ได้ (กำลังเตรียมพื้นที่จัดเก็บ)", code: "uploads_disabled", maxBytes: max },
      503
    );
  }
  const { db } = await chatRuntime();
  if (!db || !env.CHAT_COOKIE_SECRET) return json({ error: "Storage unavailable", code: "no_database" }, 503);
  const actor = await resolveActor(req, env.CHAT_COOKIE_SECRET, { issue: true });
  const uid = actor.uid!;
  const setCookie = actor.setCookie;

  // Read with a hard cap even if Content-Length lied.
  const reader = req.body?.getReader();
  if (!reader) return json({ error: "Empty body", code: "empty" }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return tooBig();
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  const id = newId();
  const key = `u/${uid}/pending/${id}`;
  await bucket.put(key, buf.buffer as ArrayBuffer, { httpMetadata: { contentType: type } });
  if (cf) cf.ctx.waitUntil(startMediaWorkflow(cf.env, { kind: "upload", userId: uid, attachmentId: id, key, mime: type, size }));
  return json({ id, size, mime: type }, 201, setCookie ? { "Set-Cookie": setCookie } : {});
}
