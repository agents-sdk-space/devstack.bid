/** Turn an uploaded object into text chunks. Bytes are never executed. */

const CHUNK = 1200;
const OVERLAP = 150;
const MAX_CHUNKS = 32;
const MAX_CHARS = 200_000;

export function extractUploadText(mime: string, bytes: Uint8Array): { text: string } | { skip: string } {
  if (mime.startsWith("image/")) return { skip: "image" };
  const text = mime === "application/pdf" ? pdfLiterals(bytes) : decodeText(bytes);
  const trimmed = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (trimmed.length < (mime === "application/pdf" ? 20 : 1)) return { skip: mime === "application/pdf" ? "pdf_text_unavailable" : "empty" };
  return { text: trimmed.slice(0, MAX_CHARS) };
}

export function chunkText(text: string, size = CHUNK, overlap = OVERLAP): string[] {
  const clean = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean || size <= overlap || size < 1) return [];
  const out: string[] = [];
  const step = size - overlap;
  for (let i = 0; i < clean.length && out.length < MAX_CHUNKS; i += step) {
    out.push(clean.slice(i, i + size));
    if (i + size >= clean.length) break;
  }
  return out;
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).slice(0, MAX_CHARS);
}

/** Pull literal strings out of a PDF content stream. Scanned PDFs return nothing. */
function pdfLiterals(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes.subarray(0, MAX_CHARS * 4));
  const parts: string[] = [];
  const re = /\(((?:\\.|[^\\)]){4,})\)/g;
  for (const match of raw.matchAll(re)) {
    const value = match[1].replace(/\\n/g, "\n").replace(/\\r/g, "").replace(/\\([()\\])/g, "$1").replace(/[^\t\n\r\x20-\x7E\u00A0-\u024F]/g, " ");
    if (/[A-Za-z\u0E00-\u0E7F]{3,}/.test(value)) parts.push(value.trim());
    if (parts.join(" ").length >= MAX_CHARS) break;
  }
  return parts.join("\n").slice(0, MAX_CHARS);
}
