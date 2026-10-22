import { connection } from "next/server";
import { chatEnv } from "@/lib/chat/config";
import { isResponse } from "@/lib/connections/route-kit";
import { appExists, buildManifest, DEFAULT_ORG, escapeHtml, manifestTarget, publicOrigin, signState } from "@/lib/github/app-manifest";
import { adminGate, page } from "@/lib/github/app-routes";

/**
 * GET /api/github/app/manifest[?owner=personal|<org>] — admin only. A page with one button that posts the
 * DevStack GitHub App manifest to GitHub (default: the agents-sdk-space org). No secrets on this page.
 */
export async function GET(req: Request) {
  await connection();
  const a = await adminGate(req, "gh-app-manifest");
  if (isResponse(a)) return a;
  const existing = await appExists(a.db);
  if (existing) {
    return page("GitHub App", `<p>The GitHub App already exists: <a href="${escapeHtml(existing.html_url)}">${escapeHtml(existing.slug)}</a>. / สร้าง GitHub App ไว้แล้ว</p><p><a class="btn" href="https://github.com/apps/${escapeHtml(existing.slug)}/installations/new">Install on repositories / ติดตั้งใน repo</a></p>`);
  }
  const ownerParam = new URL(req.url).searchParams.get("owner");
  const org = ownerParam === "personal" ? null : ownerParam && /^[A-Za-z0-9-]{1,39}$/.test(ownerParam) ? ownerParam : DEFAULT_ORG;
  const state = await signState(chatEnv().CHAT_COOKIE_SECRET!, a.uid);
  const manifest = JSON.stringify(buildManifest(publicOrigin()));
  const where = org ? `organization <b>${escapeHtml(org)}</b>` : "your personal GitHub account";
  return page(
    "Create the DevStack GitHub App",
    `<h1>Create the DevStack GitHub App</h1><p>This creates the app under ${where}. On GitHub, click <b>Create GitHub App</b>. You'll come back here automatically. / กดปุ่มด้านล่าง แล้วกด <b>Create GitHub App</b> บน GitHub ระบบจะเก็บค่าให้อัตโนมัติ</p>
<form method="post" action="${escapeHtml(manifestTarget(org, state))}"><input type="hidden" name="manifest" value="${escapeHtml(manifest)}"><button type="submit">Continue to GitHub / ไปที่ GitHub</button></form>`,
  );
}
