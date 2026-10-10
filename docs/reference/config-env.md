# Config & environment variables

ตัวแปรทั้งหมดถูกตรวจใน [`src/lib/server/env.ts`](../../src/lib/server/env.ts) (zod) ค่าที่ไม่ถูกต้องถูกแทนด้วยค่าเริ่มต้นและ log เฉพาะชื่อ วิธีจัดการ secret ดู [operations/env-secrets.md](../operations/env-secrets.md)

## ตัวแปรของแอป

| ชื่อ | ชนิด | ค่าที่อนุญาต | ค่าเริ่มต้นในโค้ด | ค่าใน `wrangler.jsonc` | ใช้ทำอะไร |
|---|---|---|---|---|---|
| `OPENAI_API_KEY` | **secret** | `^[\w-]{20,400}$` | ไม่มี → offline planner | ตั้งด้วย `wrangler secret put` | key ของผู้ดูแลสำหรับ AI planner |
| `OPENAI_MODEL` | var | `^[\w.:-]{1,80}$` | `gpt-6.1-sol` (`DEFAULT_MODEL`) | `gpt-6.1-sol` | โมเดลของ Responses API |
| `OPENAI_MAX_OUTPUT_TOKENS` | var | จำนวนเต็ม 512–16000 | 6000 | `6000` | cost guard ต่อคำขอ (เพดานแข็ง 16000) |
| `OPENAI_TIMEOUT_MS` | var | 5000–120000 | 60000 | `75000` | timeout ของการเรียก OpenAI หนึ่งครั้ง (route เผื่ออีก 5 วินาที) |
| `PLAN_LIMIT_PER_MIN` | var | 1–6000 | 20 | — | limit ของ general limiter แบบ in-memory (ใช้นอก Workers หรือเมื่อ binding ล้ม) |
| `PLAN_AI_LIMIT_PER_MIN` | var | 1–600 | 5 | — | limit ของ AI limiter แบบ in-memory |

ค่าว่าง (`""`) ถือว่าไม่ได้ตั้ง

## Cloudflare bindings (ใน [`wrangler.jsonc`](../../wrangler.jsonc))

| Binding | ชนิด | ค่า | ใช้ทำอะไร |
|---|---|---|---|
| `NVX_PLAN_LIMITER` | ratelimit (namespace `4712`) | 20 / 60 วินาที | ทุก POST `/api/plan` |
| `NVX_PLAN_AI_LIMITER` | ratelimit (namespace `4711`) | 5 / 60 วินาที | POST ที่ใช้ key ของเซิร์ฟเวอร์ |
| `ASSETS` | assets (`.open-next/assets`) | — | เสิร์ฟไฟล์ static/prerendered |
| `WORKER_SELF_REFERENCE` | service (`nvx-stack-builder`) | — | OpenNext ใช้สำหรับ cache revalidation; ต้องตรงกับ `name` |

## การตั้งค่าอื่นใน wrangler.jsonc

`name: nvx-stack-builder`, `compatibility_date: 2026-10-06`, `compatibility_flags: [nodejs_compat, global_fetch_strictly_public]`, `workers_dev: true`, `preview_urls: false`, ไม่มี `routes`, `observability.enabled: true` (`head_sampling_rate: 1`), `upload_source_maps: true`

## ตัวแปรสำหรับเครื่องมือ (ไม่ได้อ่านในแอป)

| ชื่อ | ใช้กับ | หมายเหตุ |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | wrangler (deploy, secret, rollback) | token เท่านั้น ห้ามพิมพ์/commit สิทธิ์ขั้นต่ำ Workers Scripts: Edit + Account Settings: Read |
| `CLOUDFLARE_ACCOUNT_ID` | wrangler | บัญชีทดสอบ `f70d35188a3c56b9781538c73a86e04e` |
| `NODE_ENV` | Next.js | `development` เปิด CSP แบบ dev (`unsafe-eval`, `ws:`) และไม่ส่ง HSTS |

## ไฟล์ตัวอย่าง

- [`.env.example`](../../.env.example) → คัดลอกเป็น `.env.local` สำหรับ `next dev`/`next start` (มี `OPENAI_API_KEY`, `OPENAI_MODEL`)
- [`.dev.vars.example`](../../.dev.vars.example) → คัดลอกเป็น `.dev.vars` สำหรับ `npm run preview` (มี `OPENAI_API_KEY` และตัวเลือกที่คอมเมนต์ไว้)

## localStorage ฝั่ง client (ไม่ใช่ env แต่เป็น config ของผู้ใช้)

| คีย์ | ค่า | ใช้ทำอะไร |
|---|---|---|
| `nvx-theme` | `dark` \| `light` | ธีม (ไม่มีค่า = ดำ) |
| `nvx-lang` | `th` \| `en` | ภาษา (ไม่มีค่า = ตาม `navigator.language`) |
| `nvx-builder-state` | share token | สถานะ builder ล่าสุด |

## เมื่อเพิ่มตัวแปรใหม่

เพิ่มใน schema ของ `env.ts` (พร้อม `.catch()` ค่าเริ่มต้นที่ปลอดภัย), `.env.example`/`.dev.vars.example` และ/หรือ `vars` ใน wrangler, ตารางในหน้านี้, `platform-manifest.json`, test ใน `tests/production.test.ts` — `npm run docs:check` จะล้มถ้าลืมเพิ่มในหน้านี้
