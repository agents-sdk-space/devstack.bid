import { describe, expect, it, vi } from "vitest";
import { revokeGrant } from "@/lib/auth/github-api";
import { GITHUB_SCOPES, GITHUB_SCOPES_PUBLIC, githubScopesFor, grantedScopes } from "@/lib/auth/github-policy";

describe("GitHub least privilege + revoke", () => {
  it("scope option", () => {
    expect(githubScopesFor("public")).toBe(GITHUB_SCOPES_PUBLIC);
    expect(githubScopesFor(null)).toBe(GITHUB_SCOPES);
    expect(githubScopesFor("admin:org")).toBe(GITHUB_SCOPES);
    expect(grantedScopes("public_repo,read:user,user:email", GITHUB_SCOPES)).toBe("public_repo read:user user:email");
    expect(grantedScopes("", GITHUB_SCOPES)).toBe(GITHUB_SCOPES);
  });
  it("revokes the grant with Basic auth and the token in the body", async () => {
    const f = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 204 }));
    expect(await revokeGrant({ clientId: "Iv1.abc", clientSecret: "shh", token: "gho_x" }, f as never)).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.github.com/applications/Iv1.abc/grant");
    expect(init?.method).toBe("DELETE");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa("Iv1.abc:shh")}`);
    expect(JSON.parse(String(init?.body))).toEqual({ access_token: "gho_x" });
    expect(await revokeGrant({ clientId: "a", clientSecret: "b", token: "c" }, vi.fn(async () => new Response("{}", { status: 422 })) as never)).toBe(false);
  });
});
