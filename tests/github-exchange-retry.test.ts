import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/openai", () => ({ redactSecrets: (s: string) => s }));
import { exchangeCodeWithScope, GithubApiError } from "@/lib/auth/github-api";

const opts = { clientId: "id", clientSecret: "sec", code: "abcdefgh", redirectUri: "https://devstack.bid/api/auth/github/callback" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

describe("exchangeCodeWithScope", () => {
  it("retries a transient 525 and succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("", { status: 525 })).mockResolvedValueOnce(json({ access_token: "t", scope: "repo" }));
    await expect(exchangeCodeWithScope(opts, f as unknown as typeof fetch)).resolves.toEqual({ token: "t", scope: "repo" });
    expect(f).toHaveBeenCalledTimes(2);
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Accept"]).toBe("application/json");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBeTruthy();
  });
  it("does not retry GitHub OAuth errors and reports the code", async () => {
    const f = vi.fn().mockResolvedValue(json({ error: "bad_verification_code" }));
    const err = await exchangeCodeWithScope(opts, f as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(GithubApiError);
    expect(err.step).toBe("exchange");
    expect(err.ghError).toBe("bad_verification_code");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
