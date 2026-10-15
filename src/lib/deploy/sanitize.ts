/**
 * Make provider/build error text safe to store in deployments.error_log and to show in chat:
 * removes known secrets verbatim plus anything shaped like a token, caps the length.
 */
const PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT (asset upload tokens)
  /\b(?:api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*["']?[^\s"',;]{6,}/gi,
  /\b(?![a-f0-9]{40}\b)[A-Za-z0-9_-]{40,}\b/g, // long opaque strings (Cloudflare tokens), not commit SHAs
];

export function sanitizeLog(text: string, secrets: (string | null | undefined)[] = [], max = 4000): string {
  let out = String(text ?? "");
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("[redacted]");
  for (const re of PATTERNS) out = out.replace(re, "[redacted]");
  out = out.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}
