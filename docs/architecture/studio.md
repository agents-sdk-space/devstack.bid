# Studio architecture (token label redacted merge)

Studio (`/studio`) คือแอป token label redacted v0.2.0 ของทีม (Vite + React) ที่เรารวมเข้ากับ devstack.bid ใน v0.8.0-rc หน้านี้อธิบายว่าเราต่อมันเข้ากับ Worker เดิมอย่างไร ทำไมเลือกวิธีนี้ และอะไรที่ต้องระวัง

## ทำไมเป็น sub-app ไม่ใช่หน้า Next.js

token label redacted เป็น SPA ที่ต้องการ 3 อย่างที่ Next.js App Router ของเราไม่มี: Web Worker ของ Monaco, ไฟล์ WASM ของ PGlite (~10 MB) ที่โหลดผ่าน `new URL(..., import.meta.url)` และ header เฉพาะของตัวเอง (CSP ที่ยอมให้ compile WASM, COOP/COEP และหน้า preview ที่มี CSP แยก) ถ้ายัดเข้าไปใน Next.js เราต้องแปลง bundler จาก Vite เป็น Turbopack และเสี่ยงให้ header เหล่านี้ไหลไปถึงหน้าอื่น เราจึงเลือก:

- โค้ดอยู่ใน `studio/` (มี `package.json` และ lockfile ของตัวเอง) dependency หนัก ๆ (Monaco, PGlite, Sucrase, xterm, Vite 8) ไม่ปนกับ tree ของ Next.js
- `scripts/build-studio.mjs` (รันใน `prebuild`) build เป็นไฟล์ static ลง `public/studio/` แล้ว OpenNext คัดลอกเข้า `.open-next/assets` ตามปกติ
- Cloudflare เสิร์ฟ `/studio/*` จาก static assets ก่อนถึง Worker และใส่ header จาก `public/_headers` บล็อก `/studio/*` เท่านั้น
- API ของ Studio เป็น route handler ของ Next.js ที่ `/api/studio/*` ใน Worker ตัวเดิม

```text
Browser /studio/ (COOP + COEP, Studio CSP)          Worker nvx-stack-builder (Next.js 16 / OpenNext)
───────────────────────────────────────────         ─────────────────────────────────────────────────
AgentChat → AgentOrchestrator ─► ProxyLLMProvider ─► POST /api/studio/llm/chat ─┐  same-origin check
   ├ DBAgent    → PGlite + pgvector (IndexedDB)      POST /api/studio/image ────┤  NVX_STUDIO_LIMITER (burst)
   ├ CodeAgent  → ProjectFs → Sucrase bundle         GET  /api/studio/health ───┤  nvx_chat_uid cookie (HMAC)
   └ DesignAgent→ image proxy → public/assets                                    │  D1 usage_counters (quota)
Preview iframe /studio/preview/ (sandbox) ⇄ SQL bridge                            ├► AI binding: STUDIO_MODEL
Export (JSZip) → source + SQL + Prisma + deploy                                   └► HF router: HF_MODEL (fallback)
```

## Header: COOP/COEP เฉพาะ `/studio`

| ส่วนของเว็บ | COOP | COEP | CSP |
|---|---|---|---|
| หน้า Next.js ทั้งหมด (`/`, `/chat`, `/docs` …) | `same-origin` (มีอยู่แล้วตั้งแต่ก่อน merge) | ไม่มี | `contentSecurityPolicy()` ใน `src/lib/security-headers.ts` |
| `/studio/*` (static) | `same-origin` | `require-corp` | `studioContentSecurityPolicy()` ใน `src/lib/security-headers.ts` คัดลอกไว้ใน `public/_headers` (มี test ตรวจว่าตรงกัน) |
| `/studio/preview/*` (หน้า preview) | `same-origin` | `require-corp` | `studioPreviewContentSecurityPolicy()`: บล็อกนี้ถอด CSP ของ `/studio/*` และ `X-Frame-Options` ออกก่อน (`! Content-Security-Policy`, `! X-Frame-Options`) แล้วใส่ของตัวเอง |

CSP ของ Studio ต่างจากของเว็บหลักสองจุด: `'wasm-unsafe-eval'` (PGlite compile WASM) และ `frame-src 'self'` (หน้า preview ของเราเอง ไม่มี frame จากภายนอก) ไม่มี `'unsafe-inline'` ใน `script-src` เพราะ Vite build ไม่มี inline script

ตอนนี้ไม่มีอะไรใน Studio ที่ต้องใช้ cross-origin isolation (SharedArrayBuffer) แล้ว เราคง COOP/COEP ไว้เพื่อให้ Studio อยู่ใน browsing context group ของตัวเองและไม่มี resource ข้ามโดเมน ถ้าต้องการให้ Cloudflare Web Analytics ทำงานใน `/studio` ก็ถอด COEP ออกได้โดยไม่กระทบฟีเจอร์

ผลต่อเว็บเดิม: ไม่มี เพราะ COEP อยู่ใน `/studio/*` เท่านั้น รูปภาพ, Cloudflare Web Analytics, การเรียก OpenAI/HF (ฝั่งเซิร์ฟเวอร์) และหน้าอื่นทำงานเหมือนเดิม ลิงก์เข้า/ออก Studio เป็น `<a>` ธรรมดา (ไม่ใช่ `next/link`) เพื่อให้เบราว์เซอร์โหลดเอกสารใหม่และใช้ header ชุดใหม่

ข้อควรระวังใน `/studio`: ทุก resource ข้ามโดเมนต้องส่ง `Cross-Origin-Resource-Policy` หรือ CORS ถ้า Cloudflare Web Analytics แทรก beacon (`static.cloudflareinsights.com`) ลงใน `/studio/` แล้ว beacon ไม่ส่ง CORP เบราว์เซอร์จะบล็อก script นั้น (แอปไม่พัง แต่จะมี error ใน console) ทางแก้คือยกเว้น `/studio/*` จาก Web Analytics ใน dashboard

## Static preview (แทน WebContainers)

token label redacted เดิมรัน Node.js + `npm install` + Vite dev server ใน WebContainers ของ StackBlitz ซึ่งเป็น runtime ปิดและต้องมี license เชิงพาณิชย์สำหรับการใช้งาน production บางแบบ เราเอาออกทั้งหมด (v0.8.0-rc.2) แล้วใช้ preview แบบ static ที่เป็น open source ทั้งหมด:

1. `studio/src/sandbox/staticBundler.ts` แปลงทุกไฟล์ `.js/.jsx/.ts/.tsx` ใน `src/` ด้วย [Sucrase](https://github.com/alangpierce/sucrase) (MIT, JSX automatic runtime + ESM → CommonJS) เก็บ `.css` ไว้ inject และแปลงไฟล์ใน `public/` เป็น data URL (แทน string `"/assets/x.png"` ในโค้ด) ใช้ entry จาก `<script type="module">` ใน `index.html`
2. `studio/src/preview/vendor.ts` คือ runtime (React 19 + ReactDOM) build เป็น IIFE ด้วย `vite.preview.config.ts` ออกมาเป็นไฟล์ `vendor.js` ในโฟลเดอร์ preview (ไฟล์ที่ได้จากการ build ราว 220 KB) Studio โหลดครั้งเดียว
3. iframe `/studio/preview/` (`studio/public/preview/index.html`) ใช้ `sandbox="allow-scripts allow-forms allow-modals"` (ไม่มี `allow-same-origin` จึงเป็น origin แบบ opaque) พอโหลดเสร็จจะส่ง `nvx-preview:hello` Studio ตอบด้วย `nvx-preview:load` (vendor + module map) แล้ว loader `require()` ขนาดเล็กในหน้านั้นรันโค้ด console และ error ถูกส่งกลับมาที่แท็บ Output
4. SQL bridge เดิม (`devstack:sql` ↔ `devstack:sql:result`) ยังใช้ได้ Studio รับเฉพาะข้อความจาก `contentWindow` ของ iframe ที่มี origin `"null"` แล้วตรวจคำสั่งด้วย `validateBridgeSql()` เหมือนเดิม
5. แก้ไฟล์แล้ว Studio build ใหม่ (debounce 250 ms) และโหลด iframe ใหม่ทั้งหน้า

สิ่งที่หายไปเมื่อเทียบกับ WebContainers: `npm install` แพ็กเกจอื่น, terminal shell (jsh), Node server/Vite plugin, HMR ที่เก็บ state และการเรียกเน็ตจากแอป (หน้า preview มี CSP `connect-src 'none'`) prompt ของ CodeAgent บอกเรื่องนี้แล้ว (`react` และ `react-dom` เท่านั้น) ไฟล์ export ยังเป็นโปรเจกต์ Vite ที่รันบนเครื่องได้

## LLM และภาพ: ใช้ผู้ให้บริการของเราแทน `LLM_API_KEY`

token label redacted เดิมมี proxy ของตัวเอง (`handleApiRequest()`) ที่ต้องใช้ `LLM_API_KEY` ของผู้ให้บริการแบบ OpenAI-compatible เราตัดส่วนนั้นออก (รวมถึง Node server, Vercel functions และ Cloudflare Pages functions) แล้วให้ client เรียก `src/lib/studio/route.ts` แทน โดยคง wire contract เดิม (`studio/src/shared/apiTypes.ts` ใช้ร่วมกันทั้งสองฝั่ง):

- `POST /api/studio/llm/chat` `{ messages, json?, maxTokens? }` → `{ content, model }` เรียก Workers AI (`STUDIO_MODEL`, Qwen 2.5 Coder 32B) ก่อน ถ้าล้มหรือได้คำตอบว่างจะไป Hugging Face (`HF_MODEL`, DeepSeek V3) ตั้ง `STUDIO_PROVIDER=hf` เพื่อสลับลำดับ ถ้า `json: true` เราเติมคำสั่งให้ตอบ JSON อย่างเดียว (client มี `extractJsonObject` รองรับคำตอบที่มี fence อยู่แล้ว)
- `POST /api/studio/image` `{ prompt }` → `{ dataUrl, model }` ใช้ FLUX (`WAI_IMAGE_MODEL`) แล้ว client บีบอัดเป็น PNG ใน Web Worker
- `GET /api/studio/health` → ความสามารถของเซิร์ฟเวอร์ + โควตาที่เหลือของ cookie นี้ และออก cookie `nvx_chat_uid` ถ้ายังไม่มี

ทุก POST ผ่าน: ตรวจ same-origin (`Origin` / `Sec-Fetch-Site`) → burst limiter `NVX_STUDIO_LIMITER` (20/นาที/IP) → อ่าน body ไม่เกิน 512 KB → ตัด quota ใน D1 (`studio:uid:*`, `studio:ip:*`, `studio:global` หรือ bucket ภาพของ User Chat) → เรียกโมเดล → ถ้าล้มคืน quota (`refund`) ข้อความ error เป็นไทย/อังกฤษและไม่มี secret

ถ้าไม่มี D1, `CHAT_COOKIE_SECRET` หรือทั้ง binding `AI` และ `HF_TOKEN` (เช่น `next dev` เปล่า ๆ) `/api/studio/health` ตอบ `llm: false` แล้ว Studio ใช้ mock agent ที่ deterministic ซึ่งทำ flow ทั้งหมดได้ครบ

## Design system

Studio ใช้ token ชุดเดียวกับเว็บ: `scripts/sync-studio-brand.mjs` คัดลอก `src/app/tokens.css`, ส่วน mascot และ signature ของ `src/app/globals.css`, และ component `src/components/brand/mascot.tsx`, `terminal-signature.tsx` ไปไว้ที่ `studio/src/brand/` (ห้ามแก้ตรงนั้น `tests/studio.test.ts` จะล้มถ้าไม่ sync) ชื่อ utility เดิมของ token label redacted (`bg-devstack-*`) ถูก map เข้า token ของเราใน `studio/src/index.css`: พื้นดำ, surface graphite, ฟ้า `#2997ff` เป็น accent, ปุ่มหลักสีฟ้า `#0071e3` แบบ pill, ชมพู `#fb0fab` สำหรับ glow ฟอนต์ Inter + IBM Plex Sans Thai + IBM Plex Mono ภาษาของ UI ใช้ key `nvx-lang` ใน localStorage ร่วมกับเว็บ

## ขนาดและประสิทธิภาพ

`public/studio/` ราว 34.4 MB (199 ไฟล์) ใหญ่สุดคือ `pglite-*.wasm` 10.1 MB ต่ำกว่าเพดาน 25 MiB ต่อไฟล์ของ Workers static assets หน้าแรกโหลด JS ราว 270 KB (gzip) ส่วน Monaco (~1 MB gzip), PGlite (~3 MB), Sucrase (~200 KB) และ export engine โหลดแบบ lazy runtime ของ preview (`vendor.js`) ราว 220 KB ไฟล์ใน `/studio/assets/*` cache แบบ immutable หนึ่งปี

## การทดสอบ

- `tests/studio.test.ts` (Vitest ของ Next.js): validation, same-origin, ลำดับผู้ให้บริการ, quota/refund, health ไม่มี secret, header, brand sync, ไม่มี emoji/key ใน `studio/src`
- `npm run studio:check`: ESLint + `tsc -b` + Vitest ของ Studio (agents, PGlite + pgvector, export, static bundler)
- `npm run studio:e2e`: Playwright flow "build a todo app" กับ preview ที่รันอยู่ (รวมการเพิ่ม todo ใน iframe แล้วเห็นแถวใหม่ใน Data Inspector)

## In English

We merged token label redacted as a static sub-app instead of porting it into the App Router: `studio/` keeps its own Vite build and lockfile, `scripts/build-studio.mjs` writes it to `public/studio/`, and the same Worker serves it from static assets with COOP/COEP and a Studio-specific CSP scoped to `/studio/*` in `public/_headers`. The live preview is fully open source: Sucrase compiles the project in the browser and a sandboxed, network-less iframe (`/studio/preview/`, its own CSP) runs it with a vendored React runtime; the PGlite SQL bridge is unchanged. WebContainers (npm install, Node, shell) were removed in 0.8.0-rc.2. The original key-based proxy was replaced by Next.js route handlers (`/api/studio/*`) that reuse our Workers AI binding, the Hugging Face fallback, the signed `nvx_chat_uid` cookie, D1 quotas and a new `NVX_STUDIO_LIMITER`. The rest of the site keeps its headers and gets no COEP. User guide: [Studio](../user-guide/studio.md).
