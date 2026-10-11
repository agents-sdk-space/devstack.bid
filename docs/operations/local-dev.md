# การพัฒนาบนเครื่อง · Local development

## สิ่งที่ต้องมี

- **Node.js 22+** (Wrangler 4 ไม่รองรับ Node 20; Next.js เองรันได้ตั้งแต่ 20.9) แนะนำติดตั้งผ่าน nvm
- npm (lockfile คือ `package-lock.json`)
- ไม่จำเป็นต้องมี OpenAI key — ไม่มี key แอปจะใช้ offline planner

## ติดตั้ง

```bash
git clone <repo> nvx-stack-builder && cd nvx-stack-builder
npm install            # postinstall รัน scripts/patch-opennext.mjs อัตโนมัติ
cp .env.example .env.local        # สำหรับ next dev (ถ้าต้องการ AI)
cp .dev.vars.example .dev.vars    # สำหรับ wrangler preview (ถ้าต้องการ AI)
```

`postinstall` patch adapter ของ OpenNext ให้รองรับ `preview-props.json` ของ Next 16.4 ถ้าเห็น `[patch-opennext] pattern not found` แปลว่า adapter เปลี่ยนเวอร์ชันแล้ว ให้ตรวจว่ายังต้อง patch หรือไม่ (ดู [cloudflare-runtime.md](../architecture/cloudflare-runtime.md))

## สองวิธีรัน และควรใช้เมื่อไร

| คำสั่ง | URL | ใช้เมื่อ |
|---|---|---|
| `npm run dev` | http://localhost:3000 | พัฒนาเร็ว ๆ มี hot reload; เห็น Cloudflare bindings ผ่าน `initOpenNextCloudflareForDev()` |
| `npm run preview` | http://localhost:8787 | ตรวจพฤติกรรมให้ตรง production (workerd จริง, headers, 404, rate limit binding) และ **ใช้ตรวจภาพ/ดีไซน์** |

ข้อสังเกตจากประสบการณ์: `next dev` บางครั้งแสดง CSS ค้าง (stale) หลังแก้ token มาก ๆ ให้ยืนยันภาพด้วย `npm run preview` ก่อนสรุปผลเสมอ

`npm run preview` = `opennextjs-cloudflare build && opennextjs-cloudflare preview` build ใช้เวลาประมาณ 1 นาที ถ้าต้องการรัน preview ซ้ำโดยไม่ build ใหม่: `npx opennextjs-cloudflare preview --port 8787` ปิด preview ที่ค้าง: `pkill -f "opennextjs-cloudflare preview"; pkill -f workerd`

## ชุดตรวจก่อน commit

```bash
npm run lint
npm run typecheck
npm test
npm run docs:check
npm run cf:build      # ต้องผ่านก่อน deploy
```

## การทดสอบในเบราว์เซอร์ (แนะนำเมื่อแก้ UI)

ใช้ Playwright เปิด `http://localhost:8787` แล้วตรวจ: ทุกหน้าได้ 200, `/templates/unknown` ได้ 404, `document.documentElement.scrollWidth <= innerWidth` ที่ 1440px และ 390px ทั้งภาษาไทย (`localStorage.nvx-lang = "th"`) และอังกฤษ, ไม่มี console error, flow ของ builder (เลือกเทมเพลต → ลาก → ลบ → ดาวน์โหลด → share link) ภาพหน้าจอเก็บใน `screenshots/v<x>/`

## โครงสร้างที่ควรรู้

ดู [file-map.md](../reference/file-map.md) จุดเริ่มอ่านโค้ดที่ดี: [`src/lib/composer.ts`](../../src/lib/composer.ts) → [`src/components/builder.tsx`](../../src/components/builder.tsx) → [`src/app/api/plan/route.ts`](../../src/app/api/plan/route.ts)

## ปัญหาที่พบบ่อย

- **`wrangler` บอกว่า Node เก่าเกินไป** → ใช้ Node 22+
- **พอร์ต 8787 ถูกใช้** → ปิด preview เก่าตามคำสั่งข้างบน
- **AI ไม่ทำงานใน dev** → ตรวจว่า `OPENAI_API_KEY` อยู่ใน `.env.local` หรือ `.dev.vars` และตรงรูปแบบ `^[\w-]{20,400}$`; `GET /api/plan` จะบอก `serverKeyConfigured`
- **ได้ 429 ระหว่างทดสอบ** → เกิน 20 POST/นาทีจาก IP เดียว (limiter ในหน่วยความจำรีเซ็ตเมื่อ restart server)
