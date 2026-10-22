import { json } from "@/lib/chat/runtime";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { escapeHtml, isAppAdmin } from "@/lib/github/app-manifest";

export function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;line-height:1.6;color:#111}button,a.btn{display:inline-block;background:#111;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:16px;cursor:pointer;text-decoration:none}code{background:#f2f2f2;padding:2px 4px;border-radius:4px}</style></head><body>${body}</body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

/** Signed-in DevStack admin (GITHUB_APP_ADMIN_LOGINS / AISITE_ADMIN_LOGINS) or a Response to return. */
export async function adminGate(req: Request, burstKey: string) {
  const a = await gate(req, { write: false, burstKey, perMinute: 10 });
  if (isResponse(a)) {
    if (a.status === 401) return page("Sign in", `<p>Sign in to DevStack first, then open this link again. / เข้าสู่ระบบ DevStack ก่อน แล้วเปิดลิงก์นี้อีกครั้ง</p><p><a class="btn" href="/login">Sign in / เข้าสู่ระบบ</a></p>`, 401);
    return a;
  }
  if (!isAppAdmin(a.login)) return json({ error: "Admins only. / เฉพาะผู้ดูแลระบบ", code: "forbidden" }, 403);
  return a;
}
