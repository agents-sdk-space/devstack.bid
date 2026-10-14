import { describe, expect, it } from "vitest";
import { verifyInstallationReceipt, type OriginJwk } from "@/lib/auth/cursor-receipt";
import { anonRowCanLink, issueOAuthState, readOAuthState, safeAvatar } from "@/lib/auth/oauth-flow";
import { acceptPassword, hashPassword, normalizeEmail, passwordMatches } from "@/lib/auth/password";
import { verifyPayload } from "@/lib/chat/identity";

const SECRET = "test-cookie-secret-at-least-32-characters";

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("sign-in state", () => {
  it("keeps the PKCE verifier in the cookie and rejects the wrong provider", async () => {
    const verifier = "a".repeat(43);
    const { state, cookie } = await issueOAuthState(SECRET, "google", "/templates", verifier);
    const opened = await readOAuthState(state, cookie, SECRET, "google");
    expect(opened).toEqual({ next: "/templates", verifier });
    expect(await readOAuthState(state, cookie, SECRET, "github")).toBeNull();
    const pub = JSON.parse((await verifyPayload(state, SECRET)) ?? "{}") as { c?: string };
    expect(pub.c).toBeUndefined();
  });

  it("links an anonymous row only before it has a provider", () => {
    expect(anonRowCanLink(null)).toBe(true);
    expect(anonRowCanLink({ auth_provider: null })).toBe(true);
    expect(anonRowCanLink({ auth_provider: "google" })).toBe(false);
  });

  it("allows GitHub and Google avatars only", () => {
    expect(safeAvatar("github", "https://avatars.githubusercontent.com/u/1")).toBe("https://avatars.githubusercontent.com/u/1");
    expect(safeAvatar("google", "https://lh3.googleusercontent.com/a/photo")).toMatch(/^https:\/\/lh3\.googleusercontent\.com\//);
    expect(safeAvatar("github", "https://evil.example/avatars.githubusercontent.com/u/1")).toBeNull();
    expect(safeAvatar("google", "http://lh3.googleusercontent.com/a/photo")).toBeNull();
    expect(safeAvatar("cursor", "https://avatars.githubusercontent.com/u/1")).toBeNull();
  });
});

describe("DevStack passwords", () => {
  it("normalises email and rejects a short password", () => {
    expect(normalizeEmail("  User@Example.com ")).toBe("user@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(acceptPassword("short")).toBeNull();
    expect(acceptPassword("longenough1")).toBe("longenough1");
  });

  it("hashes a password so the plaintext is not stored", async () => {
    const hashed = await hashPassword("longenough1");
    expect(hashed.hash).not.toContain("longenough1");
    expect(hashed.iterations).toBeGreaterThanOrEqual(100_000);
    expect(await passwordMatches("longenough1", hashed.salt, hashed.iterations, hashed.hash)).toBe(true);
    expect(await passwordMatches("longenough2", hashed.salt, hashed.iterations, hashed.hash)).toBe(false);
  });
});

describe("Cursor installation receipt", () => {
  it("accepts a receipt signed by an Origin key and rejects a bad state", async () => {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as OriginJwk;
    const keys = [{ ...jwk, kid: "k1" }];
    const now = 1_700_000_000;
    const state = "signed-state-value";
    const claims = {
      iss: "https://api.cursor.com/v1/origin",
      aud: "app_01example",
      sub: "i_01install",
      iat: now,
      exp: now + 120,
      state,
      installedBy: { id: "user_01jane", email: "Jane@Example.com", displayName: "Jane" },
    };
    const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "EdDSA", kid: "k1", typ: "origin-installation-receipt+jwt" })));
    const payload = b64url(new TextEncoder().encode(JSON.stringify(claims)));
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(`${header}.${payload}`)));
    const jwt = `${header}.${payload}.${b64url(sig)}`;
    const identity = await verifyInstallationReceipt(jwt, { appId: "app_01example", keys, now, state });
    expect(identity?.subject).toBe("user_01jane");
    expect(identity?.email).toBe("jane@example.com");
    expect(identity?.login).toBe("jane");
    expect(await verifyInstallationReceipt(jwt, { appId: "app_01example", keys, now, state: "other" })).toBeNull();
    expect(await verifyInstallationReceipt(jwt, { appId: "app_01other", keys, now, state })).toBeNull();
    expect(await verifyInstallationReceipt(jwt, { appId: "app_01example", keys, now: now + 10_000, state })).toBeNull();
  });
});
