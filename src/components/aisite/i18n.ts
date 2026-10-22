/** Thai / English strings for the AI chat builder (no emoji). Server responses carry `code`; the client translates them here. */
export const AISITE_TEXT = {
  en: {
    title: "Build with AI", intro: "Describe a website. The AI writes the files, every reply becomes a new version with its own preview link.",
    placeholder: "e.g. A coffee shop site with a menu, opening hours and a map link", send: "Send", sending: "Working...",
    chat: "Chat", preview: "Preview", history: "Versions", files: "Files", logs: "Build log", newProject: "New site", projects: "Your AI sites", details: "Versions, files and build log",
    revert: "Restore this version", promote: "Publish as production", export: "Export to GitHub", exportRepo: "owner/repo (existing)", branch: "Branch",
    signIn: "Sign in", signInBody: "Sign in to build with AI.", openNew: "Open in new tab", version: "Version", production: "Production", newVersion: "New",
    via: "AI route", gw: "Cloudflare AI Gateway", direct: "Direct (gateway not configured)",
    untrusted: "Generated code runs only on *.devstack.bid in a sandboxed frame.", noPreview: "No preview yet. Send a message to generate the first version.",
    "st.live": "Live", "st.failed": "Failed", "st.blocked": "Blocked", "st.pending": "Pending publish", "st.queued": "Queued", "st.building": "Building", "st.uploading": "Publishing",
    "st.dnsBlocked": "Published, link not reachable yet",
    "why.sites": "Site storage (R2 SITES) is not provisioned here.", "why.dns": "The *.devstack.bid route is not live yet.", "why.ai": "AI is not configured on this server.", "why.gateway": "AI Gateway is required in production and is not configured.",
    confirmPromote: "Replace production v{from} with v{to}?", confirmPromoteFirst: "Publish v{to} as production?", confirmRestore: "Restore v{v}? It is copied forward as a new version; history is kept.",
    restored: "Copied v{from} as v{to}.", promoted: "v{v} is now production: {url}", exported: "Exported to {repo} on branch {branch} ({n} files).", confirmExport: "Push {n} files to {repo} on branch {branch}?",
    "code.rate_limited": "Too many requests. Wait a minute.", "code.daily_limit": "Daily AI limit reached. Try again tomorrow.", "code.ai_not_configured": "AI is not configured on this server.",
    "code.ai_gateway_required": "Blocked: AI Gateway is required in production.", "code.prompt_invalid": "Describe the change (1-4000 characters).", "code.unauthorized": "Sign in first.",
    "code.forbidden": "Request blocked.", "code.reauth": "Connect GitHub first.", "code.version_not_found": "Version not found.", "code.nothing_to_export": "Nothing to export yet.",
    "code.invalid_output": "The AI reply could not be used. Try rephrasing.", "code.upstream": "The AI service failed. Try again.", "code.conflict": "Another change is in progress.", "code.limit": "Limit reached.",
  },
  th: {
    title: "สร้างเว็บด้วย AI", intro: "อธิบายเว็บที่ต้องการ AI จะเขียนไฟล์ให้ ทุกคำตอบจะเป็นเวอร์ชันใหม่พร้อมลิงก์ preview ของตัวเอง",
    placeholder: "เช่น เว็บร้านกาแฟ มีเมนู เวลาเปิดปิด และลิงก์แผนที่", send: "ส่ง", sending: "กำลังทำ...",
    chat: "แชต", preview: "ตัวอย่าง", history: "เวอร์ชัน", files: "ไฟล์", logs: "บันทึกการ build", newProject: "เว็บใหม่", projects: "เว็บ AI ของคุณ", details: "เวอร์ชัน ไฟล์ และบันทึกการ build",
    revert: "กู้คืนเวอร์ชันนี้", promote: "เผยแพร่เป็นเวอร์ชันจริง", export: "ส่งออกไป GitHub", exportRepo: "owner/repo (ที่มีอยู่แล้ว)", branch: "Branch",
    signIn: "เข้าสู่ระบบ", signInBody: "กรุณาเข้าสู่ระบบเพื่อสร้างเว็บด้วย AI", openNew: "เปิดในแท็บใหม่", version: "เวอร์ชัน", production: "เวอร์ชันจริง", newVersion: "ใหม่",
    via: "เส้นทาง AI", gw: "Cloudflare AI Gateway", direct: "ตรง (ยังไม่ตั้งค่า gateway)",
    untrusted: "โค้ดที่ AI สร้างทำงานบน *.devstack.bid ใน frame แบบ sandbox เท่านั้น", noPreview: "ยังไม่มีตัวอย่าง ส่งข้อความเพื่อสร้างเวอร์ชันแรก",
    "st.live": "ออนไลน์", "st.failed": "ล้มเหลว", "st.blocked": "ถูกบล็อก", "st.pending": "รอเผยแพร่", "st.queued": "รอคิว", "st.building": "กำลัง build", "st.uploading": "กำลังเผยแพร่",
    "st.dnsBlocked": "เผยแพร่แล้ว แต่ลิงก์ยังเปิดไม่ได้",
    "why.sites": "ยังไม่ได้เปิดที่เก็บเว็บ (R2 SITES)", "why.dns": "route *.devstack.bid ยังไม่เปิดใช้งาน", "why.ai": "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า AI", "why.gateway": "ต้องตั้งค่า AI Gateway ก่อนใช้งานจริง",
    confirmPromote: "แทนที่เวอร์ชันจริง v{from} ด้วย v{to} ใช่ไหม", confirmPromoteFirst: "เผยแพร่ v{to} เป็นเวอร์ชันจริงใช่ไหม", confirmRestore: "กู้คืน v{v} ใช่ไหม ระบบจะคัดลอกเป็นเวอร์ชันใหม่ ประวัติเดิมยังอยู่",
    restored: "คัดลอก v{from} เป็น v{to} แล้ว", promoted: "v{v} เป็นเวอร์ชันจริงแล้ว: {url}", exported: "ส่งออกไป {repo} branch {branch} แล้ว ({n} ไฟล์)", confirmExport: "push {n} ไฟล์ไปที่ {repo} branch {branch} ใช่ไหม",
    "code.rate_limited": "ส่งถี่เกินไป รอสักครู่", "code.daily_limit": "ครบโควตา AI วันนี้แล้ว ลองใหม่พรุ่งนี้", "code.ai_not_configured": "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า AI",
    "code.ai_gateway_required": "ถูกบล็อก: ต้องตั้งค่า AI Gateway ก่อนใช้งานจริง", "code.prompt_invalid": "กรุณาพิมพ์คำขอ (1-4000 ตัวอักษร)", "code.unauthorized": "กรุณาเข้าสู่ระบบก่อน",
    "code.forbidden": "คำขอถูกปฏิเสธ", "code.reauth": "เชื่อมต่อ GitHub ก่อน", "code.version_not_found": "ไม่พบเวอร์ชัน", "code.nothing_to_export": "ยังไม่มีไฟล์ให้ส่งออก",
    "code.invalid_output": "ใช้คำตอบของ AI ไม่ได้ ลองพิมพ์ใหม่", "code.upstream": "บริการ AI ขัดข้อง ลองใหม่อีกครั้ง", "code.conflict": "มีการแก้ไขอื่นอยู่", "code.limit": "ครบจำนวนที่กำหนดแล้ว",
  },
} as const;
export type AiSiteKey = keyof (typeof AISITE_TEXT)["en"];

export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** Translate a server error code; falls back to the server's own bilingual message. */
export function codeText(lang: "en" | "th", code: string | undefined, fallback: string | undefined): string {
  const k = `code.${code}` as AiSiteKey;
  return (AISITE_TEXT[lang] as Record<string, string>)[k] ?? fallback ?? "Error";
}

export type VersionStatus = { key: "st.live" | "st.failed" | "st.blocked" | "st.pending" | "st.queued" | "st.building" | "st.uploading" | "st.dnsBlocked"; why?: AiSiteKey | null; detail?: string | null };

/** Version publish status: separates real Blocked (missing infra, with a reason) from pending/in-progress states. */
export function versionStatus(v: { deploy_status: string | null; error_log: string | null }, infra: { sites: boolean; dnsReady: boolean }): VersionStatus {
  if (!v.deploy_status) return infra.sites ? { key: "st.pending" } : { key: "st.blocked", why: "why.sites" };
  if (v.deploy_status === "live") return infra.dnsReady ? { key: "st.live" } : { key: "st.dnsBlocked", why: "why.dns" };
  if (v.deploy_status === "failed") return { key: "st.failed", detail: v.error_log };
  if (v.deploy_status === "queued") return { key: "st.queued" };
  if (v.deploy_status === "uploading") return { key: "st.uploading" };
  return { key: "st.building" };
}
