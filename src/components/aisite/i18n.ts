/** Thai / English strings for the AI chat builder (no emoji). */
export const AISITE_TEXT = {
  en: {
    title: "Build with AI", intro: "Describe a website. The AI writes the files, every reply becomes a new version with its own preview link.",
    placeholder: "e.g. A coffee shop site with a menu, opening hours and a map link", send: "Send", sending: "Working...",
    chat: "Chat", preview: "Preview", history: "Versions", files: "Files", logs: "Build log", newProject: "New site", projects: "Your AI sites",
    revert: "Restore", promote: "Promote to production", export: "Export to GitHub", exportRepo: "owner/repo (existing)", branch: "Branch",
    live: "Live", failed: "Failed", blocked: "Blocked", dnsBlocked: "Published, URL blocked", noPreview: "No preview yet. Send a message to generate the first version.",
    signIn: "Sign in to build with AI.", openNew: "Open in new tab", version: "Version", production: "Production",
    via: "AI route", gw: "Cloudflare AI Gateway", direct: "Direct (gateway not configured)", aiOff: "AI is not configured on this server.", sitesOff: "Publishing is blocked: R2 SITES is not provisioned here.",
    untrusted: "Generated code runs only on *.devstack.bid in a sandboxed frame.",
  },
  th: {
    title: "สร้างเว็บด้วย AI", intro: "อธิบายเว็บที่ต้องการ AI จะเขียนไฟล์ให้ ทุกคำตอบจะเป็นเวอร์ชันใหม่พร้อมลิงก์ preview ของตัวเอง",
    placeholder: "เช่น เว็บร้านกาแฟ มีเมนู เวลาเปิดปิด และลิงก์แผนที่", send: "ส่ง", sending: "กำลังทำ...",
    chat: "แชต", preview: "ตัวอย่าง", history: "เวอร์ชัน", files: "ไฟล์", logs: "Log การ build", newProject: "เว็บใหม่", projects: "เว็บ AI ของคุณ",
    revert: "ย้อนกลับ", promote: "ขึ้นเวอร์ชันจริง", export: "ส่งออกไป GitHub", exportRepo: "owner/repo (ที่มีอยู่แล้ว)", branch: "Branch",
    live: "ออนไลน์", failed: "ล้มเหลว", blocked: "ถูกบล็อก", dnsBlocked: "เผยแพร่แล้ว แต่ลิงก์ยังถูกบล็อก", noPreview: "ยังไม่มีตัวอย่าง ส่งข้อความเพื่อสร้างเวอร์ชันแรก",
    signIn: "กรุณาเข้าสู่ระบบเพื่อสร้างเว็บด้วย AI", openNew: "เปิดในแท็บใหม่", version: "เวอร์ชัน", production: "เวอร์ชันจริง",
    via: "เส้นทาง AI", gw: "Cloudflare AI Gateway", direct: "ตรง (ยังไม่ตั้งค่า gateway)", aiOff: "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า AI", sitesOff: "การเผยแพร่ถูกบล็อก: ยังไม่ได้เปิด R2 SITES",
    untrusted: "โค้ดที่ AI สร้างทำงานบน *.devstack.bid ใน frame แบบ sandbox เท่านั้น",
  },
} as const;
export type AiSiteKey = keyof (typeof AISITE_TEXT)["en"];
