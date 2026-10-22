import { inflateRawSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export interface ZipEntry { name: string; data: Uint8Array }

/** Minimal zip reader (stored + deflate) via the central directory. No dependencies. */
export function readZip(buf: Uint8Array): ZipEntry[] {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a zip file");
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error("Corrupt zip");
    const method = b.readUInt16LE(p + 10);
    const csize = b.readUInt32LE(p + 20);
    const nlen = b.readUInt16LE(p + 28), elen = b.readUInt16LE(p + 30), clen = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const name = b.toString("utf8", p + 46, p + 46 + nlen);
    p += 46 + nlen + elen + clen;
    if (name.endsWith("/")) continue;
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const raw = b.subarray(start, start + csize);
    if (method === 0) out.push({ name, data: new Uint8Array(raw) });
    else if (method === 8) out.push({ name, data: new Uint8Array(inflateRawSync(raw)) });
    else throw new Error(`Unsupported zip compression (${method})`);
  }
  return out;
}

/** Extracts into dir, stripping one shared top-level folder; rejects path traversal. */
export function extractZip(entries: ZipEntry[], dir: string): string[] {
  const tops = new Set(entries.map((e) => e.name.split("/")[0]));
  const strip = tops.size === 1 && entries.every((e) => e.name.includes("/"));
  const root = resolve(dir);
  const written: string[] = [];
  for (const e of entries) {
    if (e.name.includes("\\") || e.name.startsWith("/") || e.name.split("/").includes("..")) throw new Error(`Unsafe path in zip: ${e.name}`);
    const rel = strip ? e.name.split("/").slice(1).join("/") : e.name;
    if (!rel || rel.includes("\\") || rel.split("/").includes("..") || rel.startsWith("/")) throw new Error(`Unsafe path in zip: ${e.name}`);
    const target = resolve(join(root, rel));
    if (!target.startsWith(root + sep)) throw new Error(`Unsafe path in zip: ${e.name}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, e.data);
    written.push(rel);
  }
  return written;
}
