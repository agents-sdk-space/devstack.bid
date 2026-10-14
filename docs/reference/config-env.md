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
| `HF_TOKEN` | **secret** | `^hf_[\w]{20,200}$` | ไม่มี → ข้าม HF | ตั้งด้วย `wrangler secret put HF_TOKEN` (stdin) | token Hugging Face (Pro) สำหรับ planner และโหมด "เก่งขึ้น" ใน User Chat |
| `HF_MODEL` | var | `^[\w./:-]{1,120}$` | `deepseek-ai/DeepSeek-V3` | `deepseek-ai/DeepSeek-V3` | โมเดลหลักของ planner และโหมด strong |
| `HF_FAST_MODEL` | var | เหมือนกัน | `meta-llama/Llama-3.1-8B-Instruct` | เหมือนกัน | โมเดลเร็ว (สำรอง) |
| `HF_BASE_URL` | var | URL https | `https://router.huggingface.co/v1` | — | endpoint แบบ OpenAI-compatible ของ HF router |
| `HF_TIMEOUT_MS` | var | 5000–120000 | 60000 | — | timeout ของการเรียก HF หนึ่งครั้ง |
| `HF_MAX_TOKENS` | var | 128–8000 | 1500 | — | เพดาน output ของแชต |
| `HF_PLAN_MAX_TOKENS` | var | 512–16000 | 6000 | — | เพดาน output ของ planner |
| `OPENAI_FALLBACK` | var | `true` / `false` | `false` | `false` | ให้ planner ถอยไปใช้ OpenAI key ของเซิร์ฟเวอร์เมื่อ HF ล้มหรือไม่ (ปิดไว้เพื่อสงวนเครดิตให้ Orchestrator) |
| `GITHUB_CLIENT_ID` | **secret** | `^[A-Za-z0-9.]{8,80}$` | ไม่มี → ปุ่ม GitHub พากลับ `/login?auth=missing&provider=github` | `wrangler secret put` (ไม่ใส่ใน `vars`) | OAuth App id สำหรับเข้าสู่ระบบ GitHub |
| `GITHUB_CLIENT_SECRET` | **secret** | `^[\w-]{16,200}$` | ไม่มี → เข้าสู่ระบบ GitHub ปิด | `wrangler secret put` (stdin) | OAuth App secret ใช้แลก code ครั้งเดียว ไม่ถูกเก็บใน D1 |
| `GOOGLE_CLIENT_ID` | **secret** | `^[A-Za-z0-9][A-Za-z0-9._-]{7,180}$` | ไม่มี → ปุ่ม Google พากลับ `/login?auth=missing&provider=google` | `wrangler secret put` (stdin) | OAuth client id callback `{origin}/api/auth/google/callback` |
| `GOOGLE_CLIENT_SECRET` | **secret** | `^[\w-]{16,200}$` | ไม่มี → เข้าสู่ระบบ Google ปิด | `wrangler secret put` (stdin) | ใช้แลก code ครั้งเดียว ไม่ถูกเก็บใน D1 |
| `CURSOR_APP_ID` | **secret** | `^app_[A-Za-z0-9]{6,80}$` | ไม่มี → ปุ่ม Cursor พากลับ `/login?auth=missing&provider=cursor` | `wrangler secret put` (stdin) | รหัสแอป Origin ที่เป็นสาธารณะ ไม่เก็บ private key ตรวจใบเสร็จจาก JWKS ของ Origin |
| `AI_GATEWAY_API_KEY` | **secret** | `^[\w-]{16,400}$` | ไม่มี → ปุ่มเกตเวย์ในตัวเลือกโมเดลกดไม่ได้ | `wrangler secret put` (stdin) | คีย์ Vercel AI Gateway สำหรับโมเดลที่ผู้ใช้เลือกใน `/chat` |
| `AI_GATEWAY_BASE_URL` | var | URL https | `https://ai-gateway.vercel.sh/v1` | — | endpoint แบบ OpenAI-compatible ของ AI Gateway |

## ตัวแปรของแชต ([`src/lib/chat/config.ts`](../../src/lib/chat/config.ts))

ค่าโควตาแบบรายวันรีเซ็ตตอนเที่ยงคืนเวลาไทย (Asia/Bangkok, UTC+7) นับต่อ cookie (`nvx_chat_uid`, ลงลายเซ็น HMAC) และมีเพดานต่อ IP = ค่าต่อผู้ใช้ × `FREE_IP_MULTIPLIER`

| ชื่อ | ชนิด | ค่าเริ่มต้นในโค้ด | ค่าใน `wrangler.jsonc` | ใช้ทำอะไร |
|---|---|---|---|---|
| `CHAT_COOKIE_SECRET` | **secret** | ไม่มี → แชตปิด | `wrangler secret put` | key HMAC ของ cookie ระบุผู้ใช้ (≥32 ตัวอักษร) |
| `CHAT_ENABLED` | var | `true` | `true` | ปิดทั้ง User Chat และ Dev Chat ได้ทันที |
| `CHAT_MAX_INPUT_CHARS` | var | 2000 | `2000` | ความยาวข้อความสูงสุด |
| `CHAT_TURN_TIMEOUT_MS` | var | 180000 | `180000` | เวลาสูงสุดต่อหนึ่ง turn |
| `CHAT_BURST_PER_MIN` | var | 4 | — | limit in-memory สำรองเมื่อไม่มี `NVX_CHAT_LIMITER` |
| `FREE_DAILY_MESSAGES` | var | 20 | `20` | User Chat: ข้อความฟรีต่อวันต่อ cookie |
| `FREE_DAILY_IMAGES` | var | 5 | `5` | User Chat: ภาพฟรีต่อวันต่อ cookie (ไม่นับรวมกับข้อความ) |
| `FREE_IP_MULTIPLIER` | var | 3 | `3` | ตัวคูณเพดานต่อ IP |
| `MAX_ATTACHMENT_BYTES` | var | 10485760 | `10485760` | ขนาดไฟล์แนบสูงสุด (10 MB) บังคับใน `/api/chat/attachments` |
| `CHAT_USER_GLOBAL_PER_DAY` | var | 3000 | `3000` | User Chat: ข้อความรวมทั้งเว็บต่อวัน (คุม neurons/เครดิต HF) |
| `CHAT_USER_GLOBAL_IMAGES_PER_DAY` | var | 500 | `500` | User Chat: ภาพ FLUX รวมทั้งเว็บต่อวัน |
| `WAI_MODEL` | var | `@cf/google/gemma-4-26b-a4b-it` | เหมือนกัน | โหมดทั่วไป (Workers AI) |
| `WAI_THAI_MODEL` | var | `@cf/aisingapore/gemma-sea-lion-v4-27b-it` | เหมือนกัน | โหมดภาษาไทย (SEA-LION) |
| `WAI_CODE_MODEL` | var | `@cf/qwen/qwen2.5-coder-32b-instruct` | เหมือนกัน | โหมดโค้ด |
| `WAI_IMAGE_MODEL` | var | `@cf/black-forest-labs/flux-1-schnell` | เหมือนกัน | สร้างภาพ (4 steps) |
| `WAI_MAX_TOKENS` | var | 1500 | `1500` | เพดาน output ของ Workers AI |
| `CHAT_MODEL` | var | `gpt-6.1-sol` | `gpt-6.1-sol` | Dev Chat: โมเดลของ Orchestrator agent |
| `CHAT_AGENT_ID` | var | `""` | `""` | ว่าง = ใช้ config inline จาก [`agents/orchestrator/agent.json`](../../agents/orchestrator/agent.json) |
| `CHAT_REASONING_EFFORT` | var | `low` | `low` | reasoning effort ของ agent |
| `CHAT_ENVIRONMENT` | var | `openai_hosted` | `openai_hosted` | sandbox ของ Dev Chat (`none` / `openai_hosted`) |
| `CHAT_CONTAINER_SIZE` | var | `small` | `small` | ขนาด sandbox ที่ OpenAI host |
| `CHAT_MAX_OUTPUT_TOKENS` | var | 2000 | `2000` | เพดาน output ต่อ turn ของ agent (ใส่ใน instructions/ฟังก์ชันภาพ) |
| `CHAT_AGENT_TURNS_PER_DAY` | var | 5 | `5` | Dev Chat: turn ต่อวันต่อ cookie |
| `CHAT_GLOBAL_TURNS_PER_DAY` | var | 30 | `30` | Dev Chat: turn รวมทั้งเว็บต่อวัน (ปกป้องเครดิต OpenAI ~$30) |
| `CHAT_AGENT_IMAGES_PER_DAY` | var | 2 | `2` | Dev Chat: ภาพ OpenAI ต่อวันต่อ cookie |
| `CHAT_GLOBAL_IMAGES_PER_DAY` | var | 20 | `20` | Dev Chat: ภาพ OpenAI รวมทั้งเว็บต่อวัน |
| `CHAT_IMAGE_MODEL` | var | `gpt-image-2.5-sunburst` | เหมือนกัน | โมเดลภาพของ agent |
| `CHAT_IMAGE_QUALITY` | var | `low` | `low` | คุณภาพภาพของ agent |
| `CHAT_DAILY_BUDGET_USD` | var | 1 | `1` | งบรวมต่อวันของ Dev Chat (ประมาณจาก usage) |
| `FACTORY_ENABLED` | var | `true` | `true` | เปิด/ปิด Sandbox Factory |
| `FACTORY_SESSIONS_PER_HOUR` | var | 10 | `10` | session ใหม่ต่อ IP ต่อชั่วโมง (กันสแปม ใช้ key ผู้ใช้เอง) |
| `FACTORY_TURNS_PER_HOUR` | var | 60 | `60` | turn ต่อ IP ต่อชั่วโมง |
| `FACTORY_BURST_PER_MIN` | var | 10 | — | limit in-memory สำรองเมื่อไม่มี `NVX_FACTORY_LIMITER` |

| `NEXT_PUBLIC_REPO_URL` | build-time (public) | URL `https://` ของ repo เช่น `https://github.com/<owner>/nvx-stack-builder` | ไม่ตั้ง | — | เปิดปุ่ม "Edit on GitHub" ในหน้า `/docs` และเปลี่ยนลิงก์ไปไฟล์โค้ดในเอกสารเป็นลิงก์ GitHub ([`src/lib/docs.ts`](../../src/lib/docs.ts), [`scripts/build-docs.mjs`](../../scripts/build-docs.mjs)) ค่าที่ไม่ใช่ https ถูกเมิน ถ้าไม่ตั้ง ปุ่มจะซ่อน |
| `NEXT_PUBLIC_SITE_URL` | build-time (public) | URL เต็ม | `https://devstack.bid` | — | `metadataBase` ใน [`src/app/layout.tsx`](../../src/app/layout.tsx) ใช้สร้าง URL เต็มของ `og:image` / `twitter:image` ถูกฝังตอน build (ไม่ใช่ secret) ถ้า deploy ไปโดเมนอื่นให้ตั้งก่อน `npm run cf:build` |

ค่าว่าง (`""`) ถือว่าไม่ได้ตั้ง

## Cloudflare bindings (ใน [`wrangler.jsonc`](../../wrangler.jsonc))

| Binding | ชนิด | ค่า | ใช้ทำอะไร |
|---|---|---|---|
| `NVX_PLAN_LIMITER` | ratelimit (namespace `4712`) | 20 / 60 วินาที | ทุก POST `/api/plan` |
| `NVX_PLAN_AI_LIMITER` | ratelimit (namespace `4711`) | 5 / 60 วินาที | POST ที่ใช้ key ของเซิร์ฟเวอร์ |
| `ASSETS` | assets (`.open-next/assets`) | — | เสิร์ฟไฟล์ static/prerendered |
| `WORKER_SELF_REFERENCE` | service (`nvx-stack-builder`) | — | OpenNext ใช้สำหรับ cache revalidation; ต้องตรงกับ `name` |
| `DB` | D1 (`nvx-db`, id `3ee9bbab-06b5-49da-b175-5f7162ad5086`, `migrations_dir: migrations`) | — | ประวัติแชตของทั้งสองแชตและ Factory (คอลัมน์ `channel`), ตัวนับโควตา `usage_counters` ดู [d1-schema.md](./d1-schema.md) |
| `AI` | Workers AI | — | โมเดลของ User Chat (`WAI_*`) ใช้ free allowance 10,000 neurons/วัน แล้วคิด $0.011 ต่อ 1,000 neurons ตอน `wrangler dev`/preview binding นี้รันแบบ remote เสมอ (ใช้โควตาจริงของบัญชี) |
| `NVX_CHAT_LIMITER` | ratelimit (namespace `4713`) | 4 / 60 วินาที | burst ของ `/api/chat/turn` และ `/api/chat/dev/turn` |
| `NVX_FACTORY_LIMITER` | ratelimit (namespace `4714`) | 10 / 60 วินาที | burst ของ `/api/factory/*` |

`ASSETS_BUCKET` (R2 bucket `nvx-assets`) **ยังไม่ได้เพิ่ม** เพราะบัญชียังไม่เปิด R2 ขั้นตอนอยู่ที่ [d1-database.md](../operations/d1-database.md) อย่าใส่ binding ก่อนมี bucket จริง เพราะ deploy จะล้ม

`MEDIA_WORKFLOW`, `VECTORIZE` และ `EMAIL` ก็ยังไม่ถูกใส่ด้วยเหตุผลเดียวกัน โค้ดของ `MediaLifecycleWorkflow` พร้อมแล้ว แต่การเพิ่ม binding จะไปสร้าง Workflow, ดัชนี Vectorize หรือช่องส่งอีเมลตอน deploy รายการคำสั่งและก้อน config อยู่ที่ [media-workflow.md](../operations/media-workflow.md) ตัวแปร `EMAIL_FROM` กับ `LIFECYCLE_FOLLOWUP` จะถูกอ่านจาก env ของ Workflow เมื่อมีค่า และยังไม่ได้อยู่ใน `vars`

## การตั้งค่าอื่นใน wrangler.jsonc

`name: nvx-stack-builder`, `compatibility_date: 2026-10-06`, `compatibility_flags: [nodejs_compat, global_fetch_strictly_public]`, `workers_dev: true`, `preview_urls: false`, ไม่มี `routes`, `observability.enabled: true` (`head_sampling_rate: 1`), `upload_source_maps: true`

## ตัวแปรสำหรับเครื่องมือ (ไม่ได้อ่านในแอป)

| ชื่อ | ใช้กับ | หมายเหตุ |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | wrangler (deploy, secret, rollback) | token เท่านั้น ห้ามพิมพ์/commit สิทธิ์ขั้นต่ำ Workers Scripts: Edit + Account Settings: Read; คำสั่ง `wrangler d1` ต้องมี D1: Edit และ R2 ต้องมี Workers R2 Storage: Edit |
| `CLOUDFLARE_ACCOUNT_ID` | wrangler | บัญชี production `2d92bd5b25768fa9093d6adc0a8887fc` (devstack.bid, workers.dev `examplessdk`); บัญชีเดิม `f70d35188a3c56b9781538c73a86e04e` (v0.3.0) |
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
