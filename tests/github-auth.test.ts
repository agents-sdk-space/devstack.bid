import { describe, expect, it } from "vitest";
import { GATEWAY_MODELS, isGatewayModel } from "@/lib/ai/gateway-models";
import {
  fencedFiles,
  githubHref,
  parseRepo,
  planAccountLink,
  safeBranch,
  safeCommitMessage,
  safeNext,
  safeRepoPath,
  sameOrigin,
} from "@/lib/auth/github-policy";
import { openSecret, sealSecret } from "@/lib/auth/token-box";
import { signPayload, verifyPayload, verifyUid, signUid, AUTH_COOKIE } from "@/lib/chat/identity";

const SECRET = "test-cookie-secret-at-least-32-characters";

describe("GitHub account linking", () => {
  it("promotes an anonymous browser when this GitHub user is new", () => {
    expect(planAccountLink("anon-1", null, "fresh")).toEqual({ userId: "anon-1", promoteAnon: true, create: false, moveFrom: null });
  });
  it("moves browser chats onto an existing GitHub account", () => {
    expect(planAccountLink("anon-1", "gh-user", "fresh")).toEqual({ userId: "gh-user", promoteAnon: false, create: false, moveFrom: "anon-1" });
  });
  it("does not move chats when the browser is already that account", () => {
    expect(planAccountLink("gh-user", "gh-user", "fresh").moveFrom).toBeNull();
  });
  it("creates an account when there is no browser cookie", () => {
    expect(planAccountLink(null, null, "fresh").create).toBe(true);
  });
});

describe("GitHub push checks", () => {
  it("accepts a relative path and rejects traversal", () => {
    expect(safeRepoPath("src/app.ts")).toBe("src/app.ts");
    expect(safeRepoPath("../etc/passwd")).toBeNull();
    expect(safeRepoPath("/etc/passwd")).toBeNull();
    expect(safeRepoPath("a//b")).toBeNull();
  });
  it("parses owner/name and a branch", () => {
    expect(parseRepo("nvx/devstack.bid")).toEqual({ owner: "nvx", name: "devstack.bid" });
    expect(parseRepo("https://github.com/a/b")).toBeNull();
    expect(safeBranch("feature/chat")).toBe("feature/chat");
    expect(safeBranch("..")).toBeNull();
  });
  it("keeps commit messages on one line", () => {
    expect(safeCommitMessage("Add hello\nworld")).toBe("Add hello world");
    expect(safeCommitMessage(" ")).toBeNull();
  });
  it("reads a file path from the first line of a fence", () => {
    const files = fencedFiles("```py\n# file: src/hello.py\nprint(1)\n```");
    expect(files).toEqual([{ lang: "py", path: "src/hello.py", code: "print(1)" }]);
  });
  it("only links to github.com", () => {
    expect(githubHref("https://github.com/a/b/blob/main/x.py")).toMatch(/^https:\/\/github.com\//);
    expect(githubHref("https://evil.example/github.com")).toBeNull();
  });
  it("only allows same-site return paths", () => {
    expect(safeNext("/chat")).toBe("/chat");
    expect(safeNext("//evil.example")).toBe("/chat");
    expect(safeNext("/api/auth/github")).toBe("/chat");
  });
  it("requires a matching Origin", () => {
    expect(sameOrigin(new Request("https://devstack.bid/api/github/contents", { headers: { host: "devstack.bid", origin: "https://devstack.bid" } }))).toBe(true);
    expect(sameOrigin(new Request("https://devstack.bid/api/github/contents", { headers: { host: "devstack.bid", origin: "https://evil.example" } }))).toBe(false);
  });
});

describe("session and token box", () => {
  it("round-trips a signed payload and rejects tampering", async () => {
    const signed = await signPayload(SECRET, "nonce|/chat");
    expect(await verifyPayload(signed, SECRET)).toBe("nonce|/chat");
    expect(await verifyPayload(`${signed}x`, SECRET)).toBeNull();
  });
  it("seals a token so the ciphertext does not contain it", async () => {
    const token = "gho_exampletokenvalue1234567890";
    const packed = await sealSecret(SECRET, token);
    expect(packed.startsWith("v1.")).toBe(true);
    expect(packed.includes(token)).toBe(false);
    expect(await openSecret(SECRET, packed)).toBe(token);
    expect(await openSecret("another-cookie-secret-at-least-32-characters", packed)).toBeNull();
  });
  it("signs the auth cookie with the same uid format", async () => {
    const uid = crypto.randomUUID();
    expect(await verifyUid(await signUid(uid, SECRET), SECRET)).toBe(uid);
    expect(AUTH_COOKIE).not.toBe("nvx_chat_uid");
  });
});

describe("Vercel AI Gateway catalog", () => {
  it("uses provider/model ids and rejects anything else", () => {
    for (const m of GATEWAY_MODELS) {
      expect(m.id.split("/")).toHaveLength(2);
      expect(m.en.length).toBeGreaterThan(0);
      expect(m.th.length).toBeGreaterThan(0);
      expect(isGatewayModel(m.id)).toBe(true);
    }
    expect(isGatewayModel("openai/gpt-5-mini/extra")).toBe(false);
    expect(isGatewayModel("claude-haiku-4.5")).toBe(false);
    expect(GATEWAY_MODELS.some((m) => m.id === "anthropic/claude-haiku-4.5")).toBe(true);
  });
});
