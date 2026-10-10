import "server-only";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Client IP: Cloudflare's header first, then common proxy headers. Never trusted for auth. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

/**
 * Read a JSON body with a hard byte limit. Rejects early on Content-Length, then streams the body
 * and aborts as soon as the limit is exceeded (so a lying/absent Content-Length can't bypass it).
 */
export async function readJsonBody(req: Request, maxBytes: number): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) throw new HttpError(415, "Content-Type must be application/json");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new HttpError(413, "Request too large");
  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "Request too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  const text = new TextDecoder().decode(bytes).trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

/** Reject a promise after `ms` (the underlying work should also be abortable). */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = "Request timed out"): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(504, message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
