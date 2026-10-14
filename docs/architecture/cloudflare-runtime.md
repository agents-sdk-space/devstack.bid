# Subsystem: Cloudflare Workers / OpenNext runtime

ตั้งแต่ v0.3.0 (commit `[commit redacted]`) แอปถูก build เป็น Cloudflare Worker ด้วย [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) 1.20.x และ Wrangler 4 คู่มือ deploy ทีละขั้นอยู่ที่ [DEPLOY.md](../DEPLOY.md) และ [operations/deploy-cloudflare.md](../operations/deploy-cloudflare.md) หน้านี้อธิบายว่า runtime ประกอบกันอย่างไรและทำไม

## ทำไม Cloudflare Workers + OpenNext

- แอปเกือบทั้งหมดเป็นหน้า prerendered + API เล็ก ๆ หนึ่งตัว เหมาะกับ edge runtime ที่เสิร์ฟ static ได้เร็วและคิดเงินตามคำขอ
- Workers มี **Rate Limiting API** ในตัว (ไม่ต้องสร้าง KV/Redis) ใช้ปกป้อง `/api/plan`
- OpenNext แปลงผล build ของ Next.js เป็น Worker ที่รองรับ App Router ได้โดยไม่ต้องเขียน adapter เอง
- ไม่ผูกกับ Cloudflare: `npm run build && npm start` ยังรันบน Node ได้ (rate limit ใช้ in-memory)

## ไฟล์ config

| ไฟล์ | สาระสำคัญ |
|---|---|
| [`wrangler.jsonc`](../../wrangler.jsonc) | `name: nvx-stack-builder`, `main: .open-next/worker.js`, `compatibility_flags: [nodejs_compat, global_fetch_strictly_public]`, `workers_dev: true`, `preview_urls: false`, **ไม่มี `routes`**, `assets` (binding `ASSETS`), service self-reference `WORKER_SELF_REFERENCE`, `vars` (OPENAI_MODEL, OPENAI_MAX_OUTPUT_TOKENS, OPENAI_TIMEOUT_MS), `ratelimits` (สอง limiter), `observability.enabled`, `upload_source_maps` |
| [`open-next.config.ts`](../../open-next.config.ts) | `incrementalCache: staticAssetsIncrementalCache` เพราะทุกหน้า prerender และไม่มี revalidate ตอน runtime จึงไม่ต้องใช้ R2/KV |
| [`cloudflare-env.d.ts`](../../cloudflare-env.d.ts) | ชนิดของ binding (สร้างด้วย `npm run cf:typegen`) |
| [`.dev.vars.example`](../../.dev.vars.example) | ต้นแบบ `.dev.vars` สำหรับ `npm run preview` (ห้าม commit `.dev.vars`) |
| [`public/_headers`](../../public/_headers) | headers ของ static assets ที่เสิร์ฟตรงจาก `.open-next/assets` |
| [`scripts/patch-opennext.mjs`](../../scripts/patch-opennext.mjs) | patch ตอน `postinstall` ให้ adapter inline `preview-props.json` ของ Next 16.4 (ไม่งั้นทุกคำขอ error `Unexpected loadManifest(...preview-props.json)`) idempotent และเตือนถ้า pattern เปลี่ยน ลบได้เมื่อ adapter แก้เอง |
| [`next.config.ts`](../../next.config.ts) | headers, 404 rewrite, และ `initOpenNextCloudflareForDev()` ใน dev เพื่อให้ `next dev` เห็น binding |

## การทำงานตอนรัน

1. คำขอเข้าที่ Worker → ถ้าเป็นไฟล์ใน `.open-next/assets` (เช่น `/_next/static/*`, HTML ที่ prerender) เสิร์ฟผ่าน `ASSETS`
2. ไม่ใช่ → handler ของ Next (OpenNext) ซึ่งรวมถึง `/api/plan`
3. `/api/plan` เรียก `getCloudflareContext().env` เพื่อหา rate-limit binding (dynamic import จึงไม่พังนอก Workers)
4. secret `OPENAI_API_KEY` และ `vars` เข้าถึงผ่าน `process.env` (ด้วย `nodejs_compat`) แล้วตรวจด้วย `serverEnv()`

## ข้อจำกัดและข้อควรรู้

- Wrangler 4 ต้องใช้ **Node 22+**
- build ใช้เวลาประมาณ 1 นาที (`npx opennextjs-cloudflare build`) ผลลัพธ์อยู่ใน `.open-next/` (gitignored)
- `npm run preview` รันใน workerd จริงที่ `http://localhost:8787` ใช้ตรวจภาพและพฤติกรรมให้ตรงกับ production มากกว่า `next dev`
- rate-limit counters เป็นต่อ Cloudflare location
- **ห้าม** เพิ่ม `routes` หรือ custom domain จนกว่าจะได้รับอนุมัติตาม [custom-domain.md](../operations/custom-domain.md)

## D1 (ฐานข้อมูล)

Worker มี binding `DB` ชี้ D1 `nvx-db` (ประกาศใน `d1_databases` ของ `wrangler.jsonc` พร้อม `migrations_dir`) ตอนนี้ยังไม่มีโค้ดเรียกใช้ D1 ดู schema ที่ [chat-data-model.md](./chat-data-model.md) และวิธีดูแลที่ [d1-database.md](../operations/d1-database.md) ส่วน R2 ยังไม่ได้เปิดใช้

## สถานะ deploy ล่าสุด

Production (v0.6.0) ที่ `https://devstack.bid` และ `www.devstack.bid` (Workers Custom Domains, redirect www → apex) บัญชี `[account ID redacted]` เวอร์ชันปัจจุบัน `[deployment ID redacted]` (ก่อนหน้า `[deployment ID redacted]` v0.5.1) workers.dev สำรอง `workers.dev URL redacted` ส่วน deploy เดิม (v0.3.0) ที่ `workers.dev URL redacted` บัญชี `[account ID redacted]` ยังเปิดอยู่และไม่ถูกแก้ไข
