# การเฝ้าระวัง · Monitoring

แอปไม่มีฐานข้อมูลและสถานะฝั่งเซิร์ฟเวอร์ สิ่งที่ต้องเฝ้าระวังจึงมีไม่มาก: ความพร้อมของหน้า, พฤติกรรมของ `/api/plan` (AI vs fallback, rate limit) และค่าใช้จ่าย OpenAI

## Cloudflare Workers Observability

`wrangler.jsonc` เปิด `"observability": { "enabled": true, "head_sampling_rate": 1 }` (เก็บ log ทุกคำขอ) และ `upload_source_maps: true` (stack trace อ่านได้) ดูใน Cloudflare Dashboard → Workers & Pages → `nvx-stack-builder` → Observability / Logs หรือดูสดด้วย:

```bash
npx wrangler tail nvx-stack-builder --format json
```

(ต้องมีสิทธิ์ Workers Tail: Read)

## โครงสร้าง log ของแอป

`/api/plan` เขียน log เป็น JSON บรรทัดเดียว ไม่มี prompt, key หรือ header:

```json
{"at":"api/plan","event":"rate_limited","ray":"8c1f...","limiter":"general","backend":"workers"}
{"at":"api/plan","event":"ai_fallback","ray":"8c1f...","reason":"OpenAI 429 (rate_limit_exceeded): ...","status":429,"keySource":"server"}
{"at":"api/plan","event":"body_read_failed","ray":"8c1f...","name":"TypeError"}
```

และ log จาก subsystem อื่น: `[env] ignoring invalid values for: ...` (config ผิด), `[rate-limit] NVX_PLAN_AI_LIMITER binding failed, using memory fallback` (binding มีปัญหา)

## สัญญาณที่ควรดูและความหมาย

| สัญญาณ | อาจหมายถึง | ทำอะไร |
|---|---|---|
| `ai_fallback` + `status: 401` | key ผิด/ถูก revoke | หมุน key ([env-secrets.md](./env-secrets.md)) |
| `ai_fallback` + `status: 429` จาก OpenAI | โควตา OpenAI หมด | ตรวจ billing/limit ฝั่ง OpenAI |
| `ai_fallback` + `timed out` บ่อย | โมเดลช้า หรือ `OPENAI_MAX_OUTPUT_TOKENS` สูงไป | ปรับ `OPENAI_TIMEOUT_MS` / token cap |
| `ai_fallback` + `invalid AI output` | โมเดลไม่ทำตาม schema | ตรวจ `OPENAI_MODEL`, prompt |
| `rate_limited` จำนวนมากจาก ray ต่างกัน | การใช้ในทางที่ผิด หรือ limit ต่ำไป | พิจารณาปรับ `ratelimits` (ต้องอนุมัติ) |
| `[env] ignoring invalid values` | `vars` ผิดรูปแบบ | แก้ `wrangler.jsonc` |
| 5xx จาก Worker | bug หรือ adapter | ดู stack trace, พิจารณา [rollback](./rollback.md) |

ใช้ค่า `ray` (จาก header `cf-ray`) เชื่อม log กับคำขอที่ผู้ใช้รายงาน

## Synthetic check (แนะนำ)

ตั้ง cron หรือ uptime monitor ภายนอกให้เรียกทุก 5–15 นาที:

- `GET /` → 200
- `GET /api/plan` → 200 และ JSON มี `serverKeyConfigured`
- (ไม่ควร POST ใน synthetic check เพราะจะเสีย rate limit และอาจเสียเงิน ถ้าจำเป็นใช้ `"mode":"fallback"`)

## ค่าใช้จ่าย

ดู usage ใน OpenAI dashboard แยกตาม key ของเซิร์ฟเวอร์ ค่าสูงสุดต่อคำขอถูกจำกัดด้วย `OPENAI_MAX_OUTPUT_TOKENS` รายละเอียดใน [rate-limits-cost.md](./rate-limits-cost.md)

## อ้างอิงโค้ด

[`src/app/api/plan/route.ts`](../../src/app/api/plan/route.ts) (`log()`), [`src/lib/server/env.ts`](../../src/lib/server/env.ts), [`src/lib/server/rate-limit.ts`](../../src/lib/server/rate-limit.ts)
