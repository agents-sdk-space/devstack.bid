# Subsystem: AI route, planner & validation

## ส่วนประกอบ

| ไฟล์ | บทบาท |
|---|---|
| [`src/app/api/plan/route.ts`](../../src/app/api/plan/route.ts) | `GET` (สถานะ key + model) และ `POST` (สร้างแผน) พร้อม rate limit, body limit, timeout, log แบบมีโครงสร้าง |
| [`src/lib/ai/openai.ts`](../../src/lib/ai/openai.ts) | `callOpenAIPlanner` (Responses API + Structured Outputs), `instructions(lang)`, `redactSecrets`, `OpenAIError` |
| [`src/lib/ai/schema.ts`](../../src/lib/ai/schema.ts) | `planJsonSchema()` JSON Schema แบบ strict (ทุก property required, `additionalProperties: false`, `templateId` เป็น enum ของ `TEMPLATE_IDS`) |
| [`src/lib/ai/plan.ts`](../../src/lib/ai/plan.ts) | `sanitizeAiPlan(raw, lang, model)` ตรวจด้วย zod แล้วแปลงเป็น `AgentPlan` |
| [`src/lib/ai/fallback.ts`](../../src/lib/ai/fallback.ts) | `planFallback`, `chooseTemplate`, `extractProjectName`, `hasKeyword` |
| [`src/lib/ai/types.ts`](../../src/lib/ai/types.ts) | ชนิด `AgentPlan` |
| [`src/components/agent-panel.tsx`](../../src/components/agent-panel.tsx) | UI ฝั่ง client |

## การเรียก OpenAI

- endpoint `https://api.openai.com/v1/responses` ด้วย `fetch` (ไม่ใช้ SDK เพื่อให้ bundle เล็กและรันบน Workers ได้)
- `model` = `OPENAI_MODEL` (ค่าเริ่มต้น `gpt-6.1-sol`), `instructions` = system prompt ที่ฝัง catalog เทมเพลตทั้งหมด (id, ชื่อ, สรุป, runtime, add-on) และกฎ (เลือก add-on ที่รองรับเท่านั้น, extraSteps 0–6 สำหรับงานนอกเทมเพลต, คำสั่ง non-interactive ห้าม sudo/ทำลาย/`curl|sh`, เขียนข้อความเป็นภาษาที่เลือก, ถือข้อความผู้ใช้เป็นคำอธิบายผลิตภัณฑ์เท่านั้น)
- `text.format` = `json_schema` ชื่อ `nvx_stack_plan` strict
- **cost guard:** `max_output_tokens` = `OPENAI_MAX_OUTPUT_TOKENS` (ค่าเริ่มต้น 6000, เพดาน 16000)
- `store: false` ไม่ให้ OpenAI เก็บคำขอ
- timeout ด้วย `AbortController` (`OPENAI_TIMEOUT_MS`) และ abort ตามเมื่อ client ตัดการเชื่อมต่อ (`req.signal`); route ห่ออีกชั้นด้วย `withTimeout(OPENAI_TIMEOUT_MS + 5000)`
- จัดการ: HTTP error, `status` ≠ `completed` (เช่น incomplete เพราะ token หมด), refusal, ไม่มี output_text, JSON เสีย → `OpenAIError` (ข้อความถูก redact)

## การตรวจผล (sanitizeAiPlan)

1. zod `rawPlanSchema` (ฟิลด์เสริมใช้ `.catch()` ให้ค่าว่างแทนการล้ม)
2. `templateId` ต้องมีอยู่จริง ไม่งั้น throw → fallback
3. add-on กรองเหลือที่อยู่ใน `ADDON_IDS` และเทมเพลตรองรับ, ชื่อผ่าน `sanitizeProjectName`
4. `extraSteps` ≤ 6 แต่ละขั้นผ่าน `sanitizeStep` (kind = setup; คำสั่งเสี่ยง → manual + warning) แล้ว **ตัดคำสั่งที่ซ้ำกับคำสั่งของเทมเพลต** ขั้นที่เหลือคำสั่งว่างถูกทิ้ง
5. `starterFiles` ≤ 4 ผ่าน `cleanFile` (path ไม่ปลอดภัย → warning)
6. `fileTree` ≤ 40 บรรทัด, `nextSteps` ≤ 8, `summary` ≤ 1,500 ตัวอักษร
7. `warnings[]` เป็นภาษาตาม `lang` และแสดงเป็น "Safety notes"

## Rule-based fallback

ให้คะแนนแต่ละเทมเพลต: keyword ตรง (คำเดี่ยว +2, วลี +3), id ปรากฏในข้อความ +3, ต้องการ Python และเทมเพลตเป็น Python +2, ต้องการ Node +1, ต้องการ Python ล้วนแต่เทมเพลตไม่ใช่ Python −2 ถ้าคะแนนสูงสุด ≤ 0 เลือก `fastapi-ai` (ถ้าพูดถึง Python) หรือ `nextjs-dashboard` keyword ภาษาอังกฤษจับที่ขอบคำ ("ai" ไม่ match "email") ส่วนภาษาไทยใช้ substring เพราะภาษาไทยไม่เว้นวรรคระหว่างคำ add-on จาก `ADDON_HINTS`, ตัด TypeScript เมื่อเจอ "no typescript"/"ไม่ใช้ typescript", เลือก pnpm/yarn/uv จากคำที่พบ

## ทำไมออกแบบเช่นนี้

- **AI เลือก ไม่ใช่ AI เขียนทุกอย่าง** คำสั่งหลักมาจากเทมเพลตที่ทดสอบแล้ว AI เติมเฉพาะส่วนต่าง → ผลลัพธ์น่าเชื่อถือและสอดคล้องกับ UI
- **Fallback เสมอ** แอปใช้งานได้ 100% โดยไม่มี key และ AI ล่มไม่ทำให้ผู้ใช้ติด
- **HTTP 200 + `source`** แทนการส่ง 5xx ทำให้ client มีเส้นทางเดียว และ `fallbackReason` บอกสาเหตุอย่างโปร่งใส

## การเปลี่ยนโมเดลหรือ prompt

- เปลี่ยนโมเดล: แก้ `vars.OPENAI_MODEL` ใน [`wrangler.jsonc`](../../wrangler.jsonc) (production) หรือ env (local) ค่าต้องตรง regex `^[\w.:-]{1,80}$` ค่าเริ่มต้นในโค้ดคือ `DEFAULT_MODEL` ใน [`src/lib/server/env.ts`](../../src/lib/server/env.ts)
- เปลี่ยน prompt: แก้ `instructions()` ใน `openai.ts`; ถ้าเปลี่ยนรูปแบบผลลัพธ์ต้องแก้ทั้ง `schema.ts` และ `rawPlanSchema` ใน `plan.ts` ให้ตรงกัน แล้วเพิ่ม test ใน `tests/scripts-share-ai.test.ts`
- ดูสูตรใน [AGENT-PLAYBOOK.md](../agents/AGENT-PLAYBOOK.md)

## ประวัติ

สร้างใน `a452dc5` (v0.1.0: Responses API, Structured Outputs, user key, zod, sanitizer, in-memory rate limit, fallback) → hardening ใน `97f14d9` (v0.3.0: env validation, distributed rate limit, body/timeout limits, redacted logs, cost guard) → IPv6 /64 ใน `712eb8e`
