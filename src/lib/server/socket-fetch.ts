/**
 * Fallback HTTPS client over `cloudflare:sockets` connect().
 *
 * Why: on a Worker served from a custom domain, outbound fetch() to some origins
 * (github.com among them) fails with HTTP 525 because of a TLS key-group bug at
 * Cloudflare's edge (cloudflare/workerd#7042). connect() with secureTransport "on"
 * completes the handshake. We only use it after fetch() returned 525.
 */

type SocketLike = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void> | void;
};
export type ConnectFn = (address: { hostname: string; port: number }, options: { secureTransport: "on"; allowHalfOpen: boolean }) => SocketLike;

const ALLOWED_HOSTS = new Set(["github.com", "api.github.com"]);
const MAX_BYTES = 2_000_000;

// Stored on globalThis: custom-worker.ts and the Next.js server chunks hold separate copies of this module.
const KEY = Symbol.for("devstack.socketConnect");
type G = typeof globalThis & { [KEY]?: ConnectFn };

/** Called once from custom-worker.ts (bundled by wrangler, which resolves `cloudflare:sockets`). */
export function registerSocketConnect(fn: ConnectFn): void {
  (globalThis as G)[KEY] = fn;
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function indexOfCrlfCrlf(buf: Uint8Array): number {
  for (let i = 0; i + 3 < buf.length; i++) if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) return i;
  return -1;
}

export function dechunk(body: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  let i = 0;
  const dec = new TextDecoder();
  while (i < body.length) {
    let j = i;
    while (j + 1 < body.length && !(body[j] === 13 && body[j + 1] === 10)) j++;
    const size = parseInt(dec.decode(body.subarray(i, j)).split(";")[0].trim(), 16);
    if (!Number.isFinite(size)) throw new Error("bad chunk");
    if (size === 0) break;
    const start = j + 2;
    parts.push(body.subarray(start, start + size));
    total += size;
    i = start + size + 2;
  }
  return concat(parts, total);
}

/** Parse a raw HTTP/1.1 response (Connection: close). */
export function parseHttpResponse(raw: Uint8Array): Response {
  const end = indexOfCrlfCrlf(raw);
  if (end < 0) throw new Error("incomplete HTTP response");
  const head = new TextDecoder().decode(raw.subarray(0, end)).split("\r\n");
  const m = head[0].match(/^HTTP\/1\.[01] (\d{3})/);
  if (!m) throw new Error("bad status line");
  const headers = new Headers();
  for (const line of head.slice(1)) {
    const k = line.indexOf(":");
    if (k > 0) headers.append(line.slice(0, k).trim(), line.slice(k + 1).trim());
  }
  let body = raw.subarray(end + 4);
  if (/chunked/i.test(headers.get("transfer-encoding") ?? "")) body = dechunk(body);
  headers.delete("transfer-encoding");
  const status = Number(m[1]);
  const nullBody = status === 204 || status === 304 || (status >= 100 && status < 200);
  return new Response(nullBody ? null : (body.slice() as Uint8Array<ArrayBuffer>), { status, headers });
}

/** Minimal HTTPS request over a raw TLS socket. Only for allow-listed GitHub hosts. */
export async function socketFetch(input: string, init: RequestInit = {}, connectFn?: ConnectFn): Promise<Response> {
  const url = new URL(input);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) throw new Error("socketFetch: host not allowed");
  const connect = connectFn ?? (globalThis as G)[KEY];
  if (!connect) throw new Error("socketFetch: sockets unavailable");
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" ? new TextEncoder().encode(init.body) : null;
  if (init.body != null && typeof init.body !== "string") throw new Error("socketFetch: only string bodies");
  const h = new Headers(init.headers);
  h.set("Host", url.hostname);
  h.set("Connection", "close");
  h.set("Accept-Encoding", "identity");
  if (body) h.set("Content-Length", String(body.length));
  let head = `${method} ${url.pathname}${url.search} HTTP/1.1\r\n`;
  h.forEach((v, k) => {
    if (/[\r\n]/.test(v) || /[\r\n]/.test(k)) throw new Error("socketFetch: bad header");
    head += `${k}: ${v}\r\n`;
  });
  head += "\r\n";
  const socket = connect({ hostname: url.hostname, port: 443 }, { secureTransport: "on", allowHalfOpen: false });
  try {
    const w = socket.writable.getWriter();
    await w.write(new TextEncoder().encode(head));
    if (body) await w.write(body);
    w.releaseLock();
    const r = socket.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (total > MAX_BYTES) throw new Error("socketFetch: response too large");
    }
    return parseHttpResponse(concat(chunks, total));
  } finally {
    await Promise.resolve(socket.close()).catch(() => {});
  }
}
