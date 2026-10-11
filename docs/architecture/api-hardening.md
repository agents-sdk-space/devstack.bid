# Subsystem: API hardening — rate limiting, env, HTTP limits, security headers

ชุดการป้องกันฝั่งเซิร์ฟเวอร์ที่เพิ่มใน v0.3.0 เพื่อเตรียม production (commit `97f14d9`, `b88a5c5`, `712eb8e`) เป้าหมายคือปกป้อง **บิล OpenAI ของผู้ดูแล**, ปกป้อง **ผู้ใช้** (headers, ไม่ log ข้อมูลส่วนตัว) และทำให้ระบบ **ไม่ล่มเพราะ config ผิด**

## Env validation — [`src/lib/server/env.ts`](../../src/lib/server/env.ts)

- อ่านค่าด้วย zod ครั้งเดียวต่อ isolate (cache จนกว่าค่าต้นทางจะเปลี่ยน)
- ค่าที่ไม่ถูกต้อง **ไม่ทำให้ crash** แต่ใช้ค่าเริ่มต้นแทน และ log เฉพาะ *ชื่อ* ตัวแปร (`[env] ignoring invalid values for: ...`) ไม่ log ค่า
- `OPENAI_API_KEY` ต้องตรง `^[\w-]{20,400}$` ไม่งั้นถือว่าไม่มี key
- ตัวแปรทั้งหมด: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MAX_OUTPUT_TOKENS` (512–16000, ค่าเริ่มต้น 6000), `OPENAI_TIMEOUT_MS` (5000–120000, 60000), `PLAN_AI_LIMIT_PER_MIN` (1–600, 5), `PLAN_LIMIT_PER_MIN` (1–6000, 20) ตารางเต็มที่ [config-env.md](../reference/config-env.md)

## HTTP limits — [`src/lib/server/http.ts`](../../src/lib/server/http.ts)

- `readJsonBody(req, 16 KB)`: Content-Type ต้องเป็น `application/json` (ไม่งั้น **415**), ปฏิเสธเร็วจาก `Content-Length` และ **อ่านแบบ stream แล้วยกเลิกทันทีเมื่อเกิน** (**413**) เพราะ `Content-Length` อาจโกหกหรือไม่มี, JSON เสีย → **400**
- `withTimeout` → `HttpError(504)` ซึ่ง route แปลงเป็น fallback plan
- `clientIp`: `cf-connecting-ip` → `x-forwarded-for` (ตัวแรก) → `x-real-ip` → `"local"`; IPv6 ถูกย่อเป็น **/64** (`ipv6Prefix64`) เพราะผู้ใช้หนึ่งรายมักคุมทั้ง /64 และหมุนที่อยู่หลบ limit ได้ (พบจริงตอนทดสอบ live ผ่าน WARP ที่ IPv6 เปลี่ยนทุก connection — commit `712eb8e`)
- `NO_STORE` header `Cache-Control: no-store` ในทุกคำตอบของ API

## Rate limiting — [`src/lib/server/rate-limit.ts`](../../src/lib/server/rate-limit.ts)

| Limiter | ใช้กับ | ค่าใน wrangler.jsonc | ค่า fallback (memory) |
|---|---|---|---|
| `NVX_PLAN_LIMITER` | ทุก POST `/api/plan` (รวม offline และ user key) | 20 ครั้ง / 60 วินาที / IP (namespace `4712`) | `PLAN_LIMIT_PER_MIN` = 20 |
| `NVX_PLAN_AI_LIMITER` | เฉพาะคำขอที่ใช้ key ของเซิร์ฟเวอร์ | 5 ครั้ง / 60 วินาที / IP (namespace `4711`) | `PLAN_AI_LIMIT_PER_MIN` = 5 |

บน Workers ใช้ **Workers Rate Limiting API binding** (นับร่วมกันทุก isolate ใน location เดียว อยู่รอดข้าม restart) นอก Workers (`next dev`, tests) หรือเมื่อ binding error ใช้ in-memory sliding window ใน [`src/lib/rate-limit.ts`](../../src/lib/rate-limit.ts) (v0.1.0) เกินแล้วได้ **429** + `Retry-After: 60` และข้อความสองภาษา หมายเหตุ: ตัวนับของ Cloudflare เป็นต่อ location และ eventually consistent burst เร็วมากอาจผ่านเกินได้เล็กน้อย ซึ่งยอมรับได้สำหรับการกันการใช้ในทางที่ผิด

## Logging

`log()` ใน route พิมพ์ JSON บรรทัดเดียว `{ at: "api/plan", event, ray, ... }` เหตุการณ์: `rate_limited` (limiter, backend), `body_read_failed`, `ai_fallback` (reason ที่ redact แล้ว, status, keySource: user/server) **ไม่เคย log prompt, key หรือ header** `redactSecrets` แทน key ที่รู้จัก, `sk-...`, `Bearer ...`, `cfat_/cfut_...` ด้วย `***`

## Security headers — [`src/lib/security-headers.ts`](../../src/lib/security-headers.ts)

ใส่ทุก route ผ่าน `headers()` ใน [`next.config.ts`](../../next.config.ts) และ mirror ให้ static assets ใน [`public/_headers`](../../public/_headers):

- **CSP**: `default-src 'self'`; `script-src 'self' 'unsafe-inline'` (+`'unsafe-eval'` เฉพาะ dev); `connect-src 'self'`; `object-src 'none'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'` — ต้องยอม `'unsafe-inline'` เพราะหน้าถูก prerender (ใส่ nonce ต่อคำขอไม่ได้) และมีสคริปต์ pre-paint ของธีม
- `Strict-Transport-Security: max-age=31536000` (production เท่านั้น ไม่มี `includeSubDomains`/`preload` ตั้งแต่ v0.5.1 เพราะแอปอยู่บน apex ของ zone devstack.bid ดู [custom-domain.md](../operations/custom-domain.md))
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (ปิดกล้อง ไมค์ ตำแหน่ง ฯลฯ), `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`
- `poweredByHeader: false`
- `/_next/static/*` ได้ `Cache-Control: public, max-age=31536000, immutable`

## Real 404

ด้วย Cache Components + Partial Prefetching, `notFound()` ใน `/templates/[id]` ถูก stream หลัง static shell จึงได้ status 200 ("soft 404") แก้ด้วย `beforeFiles` rewrite ใน `next.config.ts` ส่ง id ที่ไม่อยู่ใน `KNOWN_TEMPLATE_IDS` ไป `/__nvx_not_found` ซึ่งไม่มี route ตรง จึงได้ **HTTP 404** จริงโดยไม่ต้องใช้ middleware

## Tests

`tests/production.test.ts`: serverEnv, readJsonBody, withTimeout, redactSecrets, security headers, template id list, POST hardening (415/413/400, 429 + Retry-After, AI limiter ไม่ใช้กับ user key), clientIp (/64)
