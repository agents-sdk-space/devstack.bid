/** Minimal ustar/GNU tar reader for build artifacts (regular files only; links and devices ignored). */
export interface TarFile { path: string; bytes: Uint8Array }

const dec = new TextDecoder();
const str = (b: Uint8Array) => { const z = b.indexOf(0); return dec.decode(z >= 0 ? b.subarray(0, z) : b); };
const oct = (b: Uint8Array) => parseInt(str(b).trim() || "0", 8);

export function readTar(buf: Uint8Array, limits = { maxFiles: 20_000, maxBytes: 500 * 1024 * 1024 }): TarFile[] {
  const out: TarFile[] = [];
  let off = 0;
  let total = 0;
  let longName: string | null = null;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    const size = oct(h.subarray(124, 136));
    if (!Number.isSafeInteger(size) || size < 0) throw new Error("bad tar header");
    const type = String.fromCharCode(h[156] || 48);
    const prefix = str(h.subarray(345, 500));
    let name = longName ?? (prefix ? `${prefix}/${str(h.subarray(0, 100))}` : str(h.subarray(0, 100)));
    longName = null;
    const start = off + 512;
    if (start + size > buf.length) throw new Error("truncated tar");
    const data = buf.subarray(start, start + size);
    off = start + Math.ceil(size / 512) * 512;
    if (type === "L") { longName = str(data); continue; }
    if (type !== "0" && type !== "\0") continue;
    name = name.replace(/^\.\//, "");
    if (!name || name.startsWith("/") || name.split("/").some((p) => p === "..")) continue;
    total += size;
    if (out.length >= limits.maxFiles) throw new Error("too_many_files");
    if (total > limits.maxBytes) throw new Error("too_large");
    out.push({ path: name, bytes: data.slice() });
  }
  return out;
}
