/**
 * AES-GCM boxes for stored customer secrets. Ciphertext is what D1 stores. Callers must not log either form.
 *  - v1 (legacy): key derived from CHAT_COOKIE_SECRET (GitHub OAuth tokens before migration 0010).
 *  - v2: key derived from the dedicated CREDENTIALS_KEY secret, with HKDF info `kind:user_id` so a
 *    ciphertext only opens for the row it was sealed for. See src/lib/connections/credentials.ts.
 */

const text = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function keyFor(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", text.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: text.encode("nvx-github-token-v1"), info: text.encode("aes-gcm") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** `v1.<iv>.<ciphertext>` — the plaintext is not recoverable without `secret`. */
export async function sealSecret(secret: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFor(secret), text.encode(plaintext)));
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function openSecret(secret: string, packed: string): Promise<string | null> {
  const [v, ivB, ctB] = packed.split(".");
  if (v !== "v1" || !ivB || !ctB) return null;
  const iv = fromB64url(ivB);
  const ct = fromB64url(ctB);
  if (!iv || !ct) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, await keyFor(secret), ct as BufferSource);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

async function keyV2(secret: string, binding: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", text.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: text.encode("nvx-cred-v2"), info: text.encode(binding) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** `v2.<iv>.<ciphertext>` bound to `binding` (`kind:user_id`). */
export async function sealSecretV2(secret: string, binding: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyV2(secret, binding), text.encode(plaintext)));
  return `v2.${b64url(iv)}.${b64url(ct)}`;
}

export async function openSecretV2(secret: string, binding: string, packed: string): Promise<string | null> {
  const [v, ivB, ctB] = packed.split(".");
  if (v !== "v2" || !ivB || !ctB) return null;
  const iv = fromB64url(ivB);
  const ct = fromB64url(ctB);
  if (!iv || !ct) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, await keyV2(secret, binding), ct as BufferSource);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

export function sealVersion(packed: string): "v1" | "v2" | null {
  const v = packed.split(".")[0];
  return v === "v1" || v === "v2" ? v : null;
}
