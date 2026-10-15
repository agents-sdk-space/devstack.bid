import { setupScript } from "@/lib/cli/setup-script";

/** GET /setup.sh — the macOS arm64 one-command setup (no secrets inside; the key comes from the user's env or a hidden prompt). */
export function GET(req: Request) {
  const origin = new URL(req.url).origin === "https://www.devstack.bid" ? "https://devstack.bid" : process.env.NODE_ENV === "production" ? "https://devstack.bid" : new URL(req.url).origin;
  return new Response(setupScript(origin), { headers: { "Content-Type": "text/x-shellscript; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
