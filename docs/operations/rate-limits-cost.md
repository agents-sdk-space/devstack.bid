# Rate limits และการคุมค่าใช้จ่าย · Rate limits & cost guard

ค่าใช้จ่ายจริงของระบบเกือบทั้งหมดมาจากการเรียก OpenAI ด้วย key ของผู้ดูแล หน้านี้อธิบายกลไกที่จำกัดความเสี่ยง วิธีคำนวณกรณีเลวร้ายที่สุด และวิธีปรับค่า

## ชั้นการป้องกัน

| ชั้น | ค่า | ตั้งที่ |
|---|---|---|
| General limiter (ทุก POST) | 20 / 60 วินาที / IP (IPv6 ต่อ /64) | `wrangler.jsonc` → `ratelimits` `NVX_PLAN_LIMITER` (fallback: `PLAN_LIMIT_PER_MIN`) |
| AI limiter (key ของเซิร์ฟเวอร์เท่านั้น) | 5 / 60 วินาที / IP | `NVX_PLAN_AI_LIMITER` (fallback: `PLAN_AI_LIMIT_PER_MIN`) |
| Token cap ต่อคำขอ | `OPENAI_MAX_OUTPUT_TOKENS` = 6000 (ช่วง 512–16000, เพดานแข็ง 16000 ในโค้ด) | `vars` |
| Timeout | `OPENAI_TIMEOUT_MS` = 75000 ใน wrangler (60000 ในโค้ด), route ให้เพิ่มอีก 5 วินาที | `vars` |
| Body limit | 16 KB | โค้ด (`MAX_BODY_BYTES`) |
| Prompt | ≤ 2000 ตัวอักษร | โค้ด (`cleanText(body.prompt, 2000)`) |
| `store: false` | OpenAI ไม่เก็บคำขอ | โค้ด |

## ทำไมมีสอง limiter

- General limiter กันการยิงถล่ม endpoint ทั้งหมด รวมถึง offline planner (ใช้ CPU ของ Worker)
- AI limiter เข้มกว่าและใช้เฉพาะเมื่อใช้ **key ของผู้ดูแล** ผู้ใช้ที่ใส่ key ของตัวเองจ่ายเงินเอง จึงไม่ถูกจำกัดด้วย AI limiter
- ลำดับการตรวจ: general ก่อนอ่าน body (ประหยัดงาน) → AI limiter หลังรู้ว่าจะใช้ key ของเซิร์ฟเวอร์

## คำนวณกรณีเลวร้าย (ต่อ IP)

ต่อ IP (หรือ /64) ใช้ key ของเซิร์ฟเวอร์ได้สูงสุด 5 คำขอ/นาที × 6000 output tokens = 30,000 output tokens/นาที/IP บวก input (system prompt + catalog + prompt ≤ 2000 ตัวอักษร) ค่าจริงขึ้นกับราคาโมเดลที่ตั้งใน `OPENAI_MODEL` ผู้โจมตีที่มีหลาย IP ยังเพิ่มได้ จึงควรตั้ง **usage limit / budget alert ใน OpenAI dashboard** เป็นชั้นสุดท้ายเสมอ

## ข้อจำกัดของ Workers Rate Limiting

- ตัวนับเป็นต่อ Cloudflare location และ eventually consistent — burst เร็วมากอาจผ่านเกินเล็กน้อย
- `period` รองรับค่า 10 หรือ 60 วินาที
- ไม่ต้องสร้าง resource แยก ประกาศใน config แล้วถูกสร้างพร้อม deploy (`namespace_id` เป็นเลขที่เลือกเองและต้องไม่ซ้ำในบัญชี)

## วิธีปรับค่า (ต้องได้รับอนุมัติ)

1. แก้ `simple.limit` ใน `wrangler.jsonc` และค่า fallback `PLAN_*_LIMIT_PER_MIN` ให้สอดคล้องกัน
2. ปรับ test ใน `tests/production.test.ts` ถ้าเปลี่ยนพฤติกรรม
3. อัปเดต [config-env.md](../reference/config-env.md), หน้านี้ และ DEPLOY.md
4. deploy ตามขั้นตอนและทดสอบ 429

## สำหรับผู้ใช้ที่ได้ 429

ข้อความสองภาษา + `Retry-After: 60` UI แนะนำให้รอหรือใช้ offline planner ซึ่งให้ผลทันทีโดยไม่เสียค่าใช้จ่าย

## อ้างอิง

[`src/app/api/plan/route.ts`](../../src/app/api/plan/route.ts), [`src/lib/server/rate-limit.ts`](../../src/lib/server/rate-limit.ts), [`src/lib/rate-limit.ts`](../../src/lib/rate-limit.ts), [`wrangler.jsonc`](../../wrangler.jsonc)
