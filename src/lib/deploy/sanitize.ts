/**
 * Make provider/build error text safe to store in deployments.error_log and to show in chat:
 * removes known secrets verbatim plus anything shaped like a token, caps the length.
 */
const PATTERNS: RegExp[] = [
  /(?<=:\/\/)[^/\s:@]+:[^/\s@]+(?=@)/g, // credentials embedded in URLs (git remotes, registry URLs)
  /\bnpm_[A-Za-z0-9]{36}\b/g, // npm automation tokens
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key ids
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}\b/g, // GitHub classic/OAuth/server/user/refresh tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:cfat|cfut)_[A-Za-z0-9]{8,}\b/g, // Cloudflare account/user API tokens
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT (asset upload tokens)
  /\b(?:api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*["']?[^\s"',;]{6,}/gi,
  /\b(?![a-f0-9]{40}\b)[A-Za-z0-9_-]{40,}\b/g, // long opaque strings (Cloudflare tokens), not commit SHAs
];

export const MIN_SECRET_LENGTH = 6;

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Every form a secret may appear in logs: verbatim, URL-encoded, base64 and base64url (padded and not). */
export function secretForms(secret: string): string[] {
  const forms = new Set<string>([secret]);
  try { forms.add(encodeURIComponent(secret)); } catch { /* lone surrogate */ }
  const std = b64(secret);
  forms.add(std);
  forms.add(std.replace(/=+$/, ""));
  forms.add(std.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  return [...forms].filter((f) => f.length >= MIN_SECRET_LENGTH);
}

/** Secrets shorter than MIN_SECRET_LENGTH cannot be redacted safely (they would shred normal text). */
export function shortSecrets(secrets: (string | null | undefined)[]): number {
  return secrets.filter((s) => s && s.length < MIN_SECRET_LENGTH).length;
}

export function sanitizeLog(text: string, secrets: (string | null | undefined)[] = [], max = 4000): string {
  let out = String(text ?? "");
  const forms = secrets.flatMap((s) => (s && s.length >= MIN_SECRET_LENGTH ? secretForms(s) : []));
  // Longest first so a secret that contains another is removed whole.
  forms.sort((a, b) => b.length - a.length);
  for (const f of forms) out = out.split(f).join("[redacted]");
  for (const re of PATTERNS) out = out.replace(re, "[redacted]");
  out = out.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}
