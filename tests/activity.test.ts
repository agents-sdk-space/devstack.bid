import { describe, expect, it } from "vitest";
import { classify, cleanPath, cookieValue, suggest, visitorOf } from "@/lib/activity/core";

const req = (cookie: string, h: Record<string, string> = {}) => new Request("https://devstack.bid/", { headers: { cookie, ...h } });

describe("activity core", () => {
  it("classifies topics without keeping text", () => {
    expect(classify("How do I deploy my GitHub repo?")).toEqual(expect.arrayContaining(["deploy", "git"]));
    expect(classify("สวัสดี")).toEqual(["other"]);
  });
  it("cleans paths", () => {
    expect(cleanPath("/templates?q=secret#x")).toBe("/templates");
    expect(cleanPath("/projects/0123456789abcdef0123/logs")).toBe("/projects/:id/logs");
    expect(cleanPath("evil<script>")).toBe("/evilscript");
  });
  it("only tracks opted-in visitors and honours GPC/DNT", () => {
    const vid = "a".repeat(24);
    expect(visitorOf(req(`nvx_analytics=1; nvx_vid=${vid}`))).toBe(vid);
    expect(visitorOf(req(`nvx_analytics=0; nvx_vid=${vid}`))).toBeNull();
    expect(visitorOf(req(`nvx_vid=${vid}`))).toBeNull();
    expect(visitorOf(req(`nvx_analytics=1; nvx_vid=${vid}`, { "sec-gpc": "1" }))).toBeNull();
    expect(visitorOf(req(`nvx_analytics=1; nvx_vid=${vid}`, { dnt: "1" }))).toBeNull();
    expect(visitorOf(req("nvx_analytics=1; nvx_vid=bad!"))).toBeNull();
    expect(cookieValue("a=1; b=2", "b")).toBe("2");
  });
  it("suggests from the visitor's own recent interests", () => {
    const none = suggest([]);
    expect(none.personalized).toBe(false);
    const s = suggest([{ type: "topic", path: "/chat", target: null, topic: "python" }, { type: "pageview", path: "/templates", target: null, topic: null }]);
    expect(s.personalized).toBe(true);
    expect(s.interests[0]).toBe("python");
    expect(s.items.length).toBeGreaterThan(0);
    expect(new Set(s.items.map((i) => i.title)).size).toBe(s.items.length);
  });
});
