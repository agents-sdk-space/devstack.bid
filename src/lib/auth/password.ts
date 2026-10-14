/**
 * DevStack password accounts. PBKDF2-SHA256 via WebCrypto (Workers-safe).
 * The hash is what D1 stores. Callers must not log the password or the hash.
 */

export const PBKDF2_ITERATIONS = 100_000;
const KEY_BYTES = 32;

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 200) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(email)) return null;
  return email;
}

/** 10–200 characters, no ASCII control characters. */
export function acceptPassword(raw: string): string | null {
  if (typeof raw !== "string" || raw.length < 10 || raw.length > 200) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  return raw;
}

function b64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: asBuffer(salt), iterations }, key, KEY_BYTES * 8);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string; iterations: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return { hash: b64(hash), salt: b64(salt), iterations: PBKDF2_ITERATIONS };
}

export async function passwordMatches(password: string, saltB64: string, iterations: number, hashB64: string): Promise<boolean> {
  if (!Number.isInteger(iterations) || iterations < 50_000 || iterations > 1_000_000) return false;
  const salt = fromB64(saltB64);
  const expected = fromB64(hashB64);
  if (!salt || salt.length < 16 || !expected || expected.length !== KEY_BYTES) return false;
  const actual = await derive(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
