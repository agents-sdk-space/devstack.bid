# Studio architecture (DEVSTACK merge)

Studio (`/studio`) คือแอป DEVSTACK v0.2.0 ของทีม (Vite + React) ที่เรารวมเข้ากับ devstack.bid ใน v0.8.0-rc หน้านี้อธิบายว่าเราต่อมันเข้ากับ Worker เดิมอย่างไร ทำไมเลือกวิธีนี้ และอะไรที่ต้องระวัง

## ทำไมเป็น sub-app ไม่ใช่หน้า Next.js

DEVSTACK เป็น SPA ที่ต้องการ 3 อย่างที่ Next.js App Router ของเราไม่มี: Web Worker ของ Monaco, ไฟล์ WASM ของ PGlite (~10 MB) ที่โหลดผ่าน `new URL(..., import.meta.url)` และ header `Cross-Origin-Embedder-Policy: require-corp` ที่ WebContainers ต้องใช้ (SharedArrayBuffer) ถ้ายัดเข้าไปใน Next.js เราต้องแปลง bundler จาก Vite เป็น Turbopack และเสี่ยงให้ COEP ไหลไปถึงหน้าอื่น เราจึงเลือก:

- โค้ดอยู่ใน `studio/` (มี `package.json` และ lockfile ของตัวเอง) dependency หนัก ๆ (Monaco, PGlite, WebContainers, xterm, Vite 8) ไม่ปนกับ tree ของ Next.js
- `scripts/build-studio.mjs` (รันใน `prebuild`) build เป็นไฟล์ static ลง `public/studio/` แล้ว OpenNext คัดลอกเข้า `.open-next/assets` ตามปกติ
- Cloudflare เสิร์ฟ `/studio/*` จาก static assets ก่อนถึง Worker และใส่ header จาก `public/_headers` บล็อก `/studio/*` เท่านั้น
- API ของ Studio เป็น route handler ของ Next.js ที่ `/api/studio/*` ใน Worker ตัวเดิม

```text
Browser /studio/ (COOP + COEP, Studio CSP)          Worker nvx-stack-builder (Next.js 16 / OpenNext)
───────────────────────────────────────────         ─────────────────────────────────────────────────
AgentChat → AgentOrchestrator ─► ProxyLLMProvider ─► POST /api/studio/llm/chat ─┐  same-origin check
   ├ DBAgent    → PGlite + pgvector (IndexedDB)      POST /api/studio/image ────┤  NVX_STUDIO_LIMITER (burst)
   ├ CodeAgent  → ProjectFs → WebContainer           GET  /api/studio/health ───┤  nvx_chat_uid cookie (HMAC)
   └ DesignAgent→ image proxy → public/assets                                    │  D1 usage_counters (quota)
Preview iframe (*.webcontainer-api.io) ⇄ SQL bridge                               ├► AI binding: STUDIO_MODEL
Export (JSZip) → source + SQL + Prisma + deploy                                   └► HF router: HF_MODEL (fallback)
```

## Header: COOP/COEP เฉพาะ `/studio`

| ส่วนของเว็บ | COOP | COEP | CSP |
|---|---|---|---|
| หน้า Next.js ทั้งหมด (`/`, `/chat`, `/docs` …) | `same-origin` (มีอยู่แล้วตั้งแต่ก่อน merge) | ไม่มี | `contentSecurityPolicy()` ใน `src/lib/security-headers.ts` |
| `/studio/*` (static) | `same-origin` | `require-corp` | `studioContentSecurityPolicy()` ใน `src/lib/security-headers.ts` คัดลอกไว้ใน `public/_headers` (มี test ตรวจว่าตรงกัน) |

CSP ของ Studio ต่างจากของเว็บหลักสองจุด: `'wasm-unsafe-eval'` (PGlite compile WASM) และ `frame-src` ไปยัง `stackblitz.com`, `*.webcontainer-api.io`, `*.webcontainer.io`, `*.staticblitz.com` (sandbox และ preview) ไม่มี `'unsafe-inline'` ใน `script-src` เพราะ Vite build ไม่มี inline script

ผลต่อเว็บเดิม: ไม่มี เพราะ COEP อยู่ใน `/studio/*` เท่านั้น รูปภาพ, Cloudflare Web Analytics, การเรียก OpenAI/HF (ฝั่งเซิร์ฟเวอร์) และหน้าอื่นทำงานเหมือนเดิม ลิงก์เข้า/ออก Studio เป็น `<a>` ธรรมดา (ไม่ใช่ `next/link`) เพื่อให้เบราว์เซอร์โหลดเอกสารใหม่และใช้ header ชุดใหม่

ข้อควรระวังใน `/studio`: ทุก resource ข้ามโดเมนต้องส่ง `Cross-Origin-Resource-Policy` หรือ CORS ถ้า Cloudflare Web Analytics แทรก beacon (`static.cloudflareinsights.com`) ลงใน `/studio/` แล้ว beacon ไม่ส่ง CORP เบราว์เซอร์จะบล็อก script นั้น (แอปไม่พัง แต่จะมี error ใน console) ทางแก้คือยกเว้น `/studio/*` จาก Web Analytics ใน dashboard

## LLM และภาพ: ใช้ผู้ให้บริการของเราแทน `LLM_API_KEY`

DEVSTACK เดิมมี proxy ของตัวเอง (`handleApiRequest()`) ที่ต้องใช้ `LLM_API_KEY` ของผู้ให้บริการแบบ OpenAI-compatible เราตัดส่วนนั้นออก (รวมถึง Node server, Vercel functions และ Cloudflare Pages functions) แล้วให้ client เรียก `src/lib/studio/route.ts` แทน โดยคง wire contract เดิม (`studio/src/shared/apiTypes.ts` ใช้ร่วมกันทั้งสองฝั่ง):

- `POST /api/studio/llm/chat` `{ messages, json?, maxTokens? }` → `{ content, model }` เรียก Workers AI (`STUDIO_MODEL`, Qwen 2.5 Coder 32B) ก่อน ถ้าล้มหรือได้คำตอบว่างจะไป Hugging Face (`HF_MODEL`, DeepSeek V3) ตั้ง `STUDIO_PROVIDER=hf` เพื่อสลับลำดับ ถ้า `json: true` เราเติมคำสั่งให้ตอบ JSON อย่างเดียว (client มี `extractJsonObject` รองรับคำตอบที่มี fence อยู่แล้ว)
- `POST /api/studio/image` `{ prompt }` → `{ dataUrl, model }` ใช้ FLUX (`WAI_IMAGE_MODEL`) แล้ว client บีบอัดเป็น PNG ใน Web Worker
- `GET /api/studio/health` → ความสามารถของเซิร์ฟเวอร์ + โควตาที่เหลือของ cookie นี้ และออก cookie `nvx_chat_uid` ถ้ายังไม่มี

ทุก POST ผ่าน: ตรวจ same-origin (`Origin` / `Sec-Fetch-Site`) → burst limiter `NVX_STUDIO_LIMITER` (20/นาที/IP) → อ่าน body ไม่เกิน 512 KB → ตัด quota ใน D1 (`studio:uid:*`, `studio:ip:*`, `studio:global` หรือ bucket ภาพของ User Chat) → เรียกโมเดล → ถ้าล้มคืน quota (`refund`) ข้อความ error เป็นไทย/อังกฤษและไม่มี secret

ถ้าไม่มี D1, `CHAT_COOKIE_SECRET` หรือทั้ง binding `AI` และ `HF_TOKEN` (เช่น `next dev` เปล่า ๆ) `/api/studio/health` ตอบ `llm: false` แล้ว Studio ใช้ mock agent ที่ deterministic ซึ่งทำ flow ทั้งหมดได้ครบ

## Design system

Studio ใช้ token ชุดเดียวกับเว็บ: `scripts/sync-studio-brand.mjs` คัดลอก `src/app/tokens.css`, ส่วน mascot และ signature ของ `src/app/globals.css`, และ component `src/components/brand/mascot.tsx`, `terminal-signature.tsx` ไปไว้ที่ `studio/src/brand/` (ห้ามแก้ตรงนั้น `tests/studio.test.ts` จะล้มถ้าไม่ sync) ชื่อ utility เดิมของ DEVSTACK (`bg-devstack-*`) ถูก map เข้า token ของเราใน `studio/src/index.css`: พื้นดำ, surface graphite, ฟ้า `#2997ff` เป็น accent, ปุ่มหลักสีฟ้า `#0071e3` แบบ pill, ชมพู `#fb0fab` สำหรับ glow ฟอนต์ Inter + IBM Plex Sans Thai + IBM Plex Mono ภาษาของ UI ใช้ key `nvx-lang` ใน localStorage ร่วมกับเว็บ

## ขนาดและประสิทธิภาพ

`public/studio/` ราว 34 MB (197 ไฟล์) ใหญ่สุดคือ `pglite-*.wasm` 10.1 MB ต่ำกว่าเพดาน 25 MiB ต่อไฟล์ของ Workers static assets หน้าแรกโหลด JS ราว 270 KB (gzip) ส่วน Monaco (~1 MB gzip), PGlite (~3 MB) และ export engine โหลดแบบ lazy ไฟล์ใน `/studio/assets/*` cache แบบ immutable หนึ่งปี

## การทดสอบ

- `tests/studio.test.ts` (Vitest ของ Next.js): validation, same-origin, ลำดับผู้ให้บริการ, quota/refund, health ไม่มี secret, header, brand sync, ไม่มี emoji/key ใน `studio/src`
- `npm run studio:check`: ESLint + `tsc -b` + Vitest ของ Studio (agents, PGlite + pgvector, export, sandbox)
- `npm run studio:e2e`: Playwright flow "build a todo app" กับ preview ที่รันอยู่

## In English

We merged DEVSTACK as a static sub-app instead of porting it into the App Router: `studio/` keeps its own Vite build and lockfile, `scripts/build-studio.mjs` writes it to `public/studio/`, and the same Worker serves it from static assets with COOP/COEP and a Studio-specific CSP scoped to `/studio/*` in `public/_headers`. The original key-based proxy was replaced by Next.js route handlers (`/api/studio/*`) that reuse our Workers AI binding, the Hugging Face fallback, the signed `nvx_chat_uid` cookie, D1 quotas and a new `NVX_STUDIO_LIMITER`. The rest of the site keeps its headers and gets no COEP. User guide: [Studio](../user-guide/studio.md).
