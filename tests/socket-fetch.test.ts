import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { dechunk, parseHttpResponse, registerSocketConnect, socketFetch, type ConnectFn } from "@/lib/server/socket-fetch";
import { fetchRetry } from "@/lib/auth/github-api";

const enc = (s: string) => new TextEncoder().encode(s);

function fakeConnect(reply: string, sent: string[]): ConnectFn {
  return () => {
    const readable = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc(reply)); c.close(); } });
    const writable = new WritableStream<Uint8Array>({ write(chunk) { sent.push(new TextDecoder().decode(chunk)); } });
    return { readable, writable, close: () => {} };
  };
}

describe("socketFetch (525 fallback)", () => {
  it("parses a plain and a chunked response", async () => {
    const r = parseHttpResponse(enc('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"a":1}'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ a: 1 });
    expect(new TextDecoder().decode(dechunk(enc("4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n")))).toBe("Wikipedia");
  });

  it("sends a well-formed POST and returns the body", async () => {
    const sent: string[] = [];
    const res = await socketFetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json" }, body: "code=abc" }, fakeConnect('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n14\r\n{"access_token":"t"}\r\n0\r\n\r\n', sent));
    expect(await res.json()).toEqual({ access_token: "t" });
    const head = sent.join("");
    expect(head.startsWith("POST /login/oauth/access_token HTTP/1.1\r\n")).toBe(true);
    expect(head).toMatch(/host: github\.com/i);
    expect(head).toMatch(/content-length: 8/i);
    expect(head.endsWith("code=abc")).toBe(true);
  });

  it("refuses non-GitHub hosts and header injection", async () => {
    await expect(socketFetch("https://evil.example/", {}, fakeConnect("", []))).rejects.toThrow(/not allowed/);
    await expect(socketFetch("http://github.com/", {}, fakeConnect("", []))).rejects.toThrow(/not allowed/);
  });

  it("fetchRetry falls back to the socket on 525 only", async () => {
    const f = vi.fn(async () => new Response("", { status: 525 })) as unknown as typeof fetch;
    const sock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    const res = await fetchRetry("https://github.com/login/oauth/access_token", { method: "POST", body: "x" }, 3, f, sock);
    expect(res.status).toBe(200);
    expect(sock).toHaveBeenCalledTimes(1);
    const ok = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const sock2 = vi.fn();
    await fetchRetry("https://github.com/x", {}, 3, ok, sock2);
    expect(sock2).not.toHaveBeenCalled();
  });

  it("uses the connect() registered by the worker entry", async () => {
    const sent: string[] = [];
    registerSocketConnect(fakeConnect("HTTP/1.1 204 No Content\r\n\r\n", sent));
    const res = await socketFetch("https://api.github.com/user", { headers: { Accept: "application/json" } });
    expect(res.status).toBe(204);
    expect(sent.join("")).toMatch(/^GET \/user HTTP\/1\.1/);
  });
});
