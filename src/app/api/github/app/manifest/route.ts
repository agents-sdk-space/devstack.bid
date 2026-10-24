import { connection } from "next/server";
import { chatEnv } from "@/lib/chat/config";
import { isResponse } from "@/lib/connections/route-kit";
import { appExists, buildManifest, DEFAULT_ORG, escapeHtml, manifestTarget, publicOrigin, signState } from "@/lib/github/app-manifest";
import { githubManifestContentSecurityPolicy } from "@/lib/security-headers";
import { adminGate, page } from "@/lib/github/app-routes";
import { githubAppRecoveryLinks } from "@/lib/github/app-install-recovery";

/**
 * GET /api/github/app/manifest[?owner=_personal|<org>] — admin only. A page with one button that posts the
 * DevStack GitHub App manifest to GitHub (default: the agents-sdk-space org). No secrets on this page.
 */
export async function GET(req: Request) {
  await connection();
  const a = await adminGate(req, "gh-app-manifest");
  if (isResponse(a)) return a;
  const existing = await appExists(a.db);
  if (existing) {
    const links = githubAppRecoveryLinks(existing.owner);
    const organizationLink = links.organizationInstallations
      ? `<p><a class="btn" href="${escapeHtml(links.organizationInstallations)}">Manage organization installation / จัดการแอปในองค์กร</a></p>`
      : "";
    return page(
      "GitHub App — already configured",
      `<h1>GitHub App already configured / แอปเชื่อมไว้แล้ว</h1>
<p><b>${escapeHtml(existing.slug)}</b> is already registered and saved in DevStack. Do not install or create it again. / ระบบมีแอปนี้อยู่แล้ว ไม่ต้องติดตั้งหรือสร้างใหม่</p>
<p><a href="${escapeHtml(existing.html_url)}">View GitHub App / ดูหน้าแอป</a></p>
<h2>Next step / ขั้นตอนต่อไป</h2>
<p>Installing a GitHub App is different from connecting a GitHub user session or importing a repository. Sign in with GitHub on DevStack, then import the repository to create its project connection. / การติดตั้งแอปกับการผูก repo เข้ากับโปรเจกต์เป็นคนละขั้นตอน</p>
<p><a class="btn" href="${escapeHtml(links.importGit)}">Import repository in DevStack / นำเข้า Repo</a></p>
<h2>Change repository access / แก้สิทธิ์การเข้าถึง</h2>
<p>If GitHub says "only your admin can update it", sign in with an owner of the GitHub organization, or ask that owner to update the existing installation. DevStack cannot override GitHub organization policy. / ถ้า GitHub แจ้งว่าเฉพาะ Admin แก้ได้ ต้องใช้บัญชี Owner ขององค์กรหรือขอให้ Owner อนุมัติ</p>
${organizationLink}
<p><a class="btn" href="${escapeHtml(links.personalInstallations)}">Manage personal installations / แอปในบัญชีส่วนตัว</a></p>
<p>Do not uninstall this app while it is delivering signed webhooks. / ไม่ควรถอนการติดตั้งขณะที่ระบบยังรับ Webhook อยู่</p>`,
    );
  }
  const ownerParam = new URL(req.url).searchParams.get("owner");
  const org = ownerParam === "_personal" ? null : ownerParam && /^[A-Za-z0-9-]{1,39}$/.test(ownerParam) ? ownerParam : DEFAULT_ORG;
  const state = await signState(chatEnv().CHAT_COOKIE_SECRET!, a.uid);
  const manifest = JSON.stringify(buildManifest(publicOrigin()));
  const where = org ? `organization <b>${escapeHtml(org)}</b>` : "your personal GitHub account";
  return page(
    "Create the DevStack GitHub App",
    `<h1>Create the DevStack GitHub App</h1><p>This creates the app under ${where}. On GitHub, click <b>Create GitHub App</b>. You'll come back here automatically. / กดปุ่มด้านล่าง แล้วกด <b>Create GitHub App</b> บน GitHub ระบบจะเก็บค่าให้อัตโนมัติ</p>
<form method="post" action="${escapeHtml(manifestTarget(org, state))}"><input type="hidden" name="manifest" value="${escapeHtml(manifest)}"><button type="submit">Continue to GitHub / ไปที่ GitHub</button></form>`,
    200,
    githubManifestContentSecurityPolicy(),
  );
}
