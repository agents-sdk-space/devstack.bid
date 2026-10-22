import { connection } from "next/server";
import { chatEnv } from "@/lib/chat/config";
import { isResponse } from "@/lib/connections/route-kit";
import { convertManifest, escapeHtml, storeAppBundle, verifyState } from "@/lib/github/app-manifest";
import { adminGate, page } from "@/lib/github/app-routes";

/** GET /api/github/app/manifest-callback?code&state — GitHub's redirect after "Create GitHub App". Admin only. */
export async function GET(req: Request) {
  await connection();
  const a = await adminGate(req, "gh-app-callback");
  if (isResponse(a)) return a;
  const u = new URL(req.url);
  if (!(await verifyState(chatEnv().CHAT_COOKIE_SECRET!, a.uid, u.searchParams.get("state")))) {
    return page("Expired", `<p>This link expired or is invalid. Open the create page again. / ลิงก์หมดอายุ เปิดหน้าสร้างใหม่อีกครั้ง</p><p><a class="btn" href="/api/github/app/manifest">Start again / เริ่มใหม่</a></p>`, 400);
  }
  let bundle;
  try {
    bundle = await convertManifest(u.searchParams.get("code") ?? "");
  } catch (err) {
    console.warn(JSON.stringify({ at: "api/github/app/manifest-callback", event: "conversion_failed", reason: err instanceof Error ? err.message : "error" }));
    return page("Failed", `<p>GitHub didn't accept the code (it works once, within 1 hour). / GitHub ไม่รับรหัส ลองใหม่อีกครั้ง</p>`, 502);
  }
  const stored = await storeAppBundle(a.db, a.keys, bundle, a.uid);
  if (!stored) return page("Already set up", `<p>An app is already stored; this one was not saved. Delete the extra app <a href="${escapeHtml(bundle.html_url)}">${escapeHtml(bundle.slug)}</a> on GitHub. / มีแอปอยู่แล้ว</p>`, 409);
  console.info(JSON.stringify({ at: "api/github/app/manifest-callback", event: "app_stored", appId: bundle.id, slug: bundle.slug }));
  return page(
    "GitHub App created",
    `<h1>Done / เรียบร้อย</h1><p>App <b>${escapeHtml(bundle.slug)}</b> (id ${bundle.id}) is saved securely. Next, install it on the repositories to deploy. / บันทึกแล้ว ขั้นต่อไปติดตั้งแอปใน repo</p><p><a class="btn" href="https://github.com/apps/${escapeHtml(bundle.slug)}/installations/new">Install / ติดตั้ง</a></p>`,
  );
}
