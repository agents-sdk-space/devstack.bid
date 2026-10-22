import { describe, expect, it } from "vitest";
import { githubConnectHref, safeNext } from "@/lib/auth/github-policy";
import { oauthFail, signedInRedirect } from "@/lib/auth/oauth-flow";

const ORIGIN = "https://devstack.bid";

describe("GitHub connect return path", () => {
  it("keeps /new and its mode query", () => {
    expect(safeNext("/new")).toBe("/new");
    expect(safeNext("/new?mode=template")).toBe("/new?mode=template");
    expect(githubConnectHref("/new?mode=template")).toBe("/api/auth/github?next=%2Fnew%3Fmode%3Dtemplate");
    expect(githubConnectHref("/new", "public")).toBe("/api/auth/github?scope=public&next=%2Fnew");
  });

  it("rejects open redirects and loops", () => {
    for (const bad of ["https://evil.example/x", "//evil.example", "/\\evil.example", "\t/new", "/api/auth/github", "/login?next=/new", "javascript:alert(1)", `/${"a".repeat(250)}`]) {
      const out = safeNext(bad);
      expect(out).toBe("/chat");
    }
    expect(safeNext("//evil", "/")).toBe("/");
    // Encoded CR/LF stays percent-encoded (inert in a Location header).
    expect(safeNext("/%0d%0aLocation:x")).not.toMatch(/[\r\n]/);
  });

  it("normalises paths that would resolve off-origin", () => {
    const out = safeNext("/..//evil.example");
    expect(new URL(out, ORIGIN).origin).toBe(ORIGIN);
  });

  it("sign-in success redirects back to the saved page", () => {
    const res = signedInRedirect(ORIGIN, true, "/new?mode=template", "session");
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/new?mode=template`);
    const evil = signedInRedirect(ORIGIN, true, "//evil.example", "session");
    expect(new URL(evil.headers.get("Location")!).origin).toBe(ORIGIN);
  });

  it("failure keeps the return path on /login so a retry comes back", () => {
    const res = oauthFail(ORIGIN, true, "error", "github", "/new?mode=git");
    const loc = new URL(res.headers.get("Location")!);
    expect(loc.origin).toBe(ORIGIN);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/new?mode=git");
    const evil = new URL(oauthFail(ORIGIN, true, "error", "github", "https://evil.example").headers.get("Location")!);
    expect(evil.searchParams.get("next")).toBeNull();
  });
});
