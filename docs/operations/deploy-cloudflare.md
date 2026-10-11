# Deploy ไป Cloudflare Workers

> คู่มือฉบับเต็มทีละคำสั่ง (TH + EN) คือ **[DEPLOY.md](../DEPLOY.md)** หน้านี้ไม่คัดลอกซ้ำ แต่สรุปกระบวนการ เหตุผล และ checklist ที่ต้องทำทุกครั้ง

## นโยบาย (ต้องอ่านก่อน)

- **การ deploy ทุกครั้งต้องได้รับอนุมัติจากมนุษย์** ระบุบัญชี ชื่อ Worker และขอบเขตอย่างชัดเจน
- deploy เฉพาะ **Worker ใหม่ชื่อ `nvx-stack-builder`** บน **workers.dev เท่านั้น** ห้ามเพิ่ม `routes`, custom domain, DNS
- **ห้ามแก้หรือลบ Worker/resource อื่น** ในบัญชี (เช่น `agents-sdk-space`, `agent-starter`, `mcp-worker` ฯลฯ) และห้ามแตะ zone `agents-sdk.space`
- ห้าม `git push` ถ้าไม่ได้รับคำสั่ง ห้ามพิมพ์ secret

## ขั้นตอนโดยสรุป

1. **ตรวจโค้ด**: `npm run lint && npm run typecheck && npm test && npm run docs:check && npm run cf:build`
2. **ตั้งตัวแปร**: `CLOUDFLARE_API_TOKEN` (เฉพาะ token), `CLOUDFLARE_ACCOUNT_ID` (บัญชี production `2d92bd5b25768fa9093d6adc0a8887fc`, devstack.bid, workers.dev `examplessdk`; บัญชีเดิม v0.3.0 `f70d35188a3c56b9781538c73a86e04e`) ถ้าใช้ token หลายบัญชีบนเครื่องเดียว ให้ส่งเฉพาะคำสั่ง เช่น `CLOUDFLARE_API_TOKEN="$TOKEN_X" CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler ...` แทนการ export ค้างไว้
3. **ตรวจชื่อว่าง/เป็นของเรา**: `npx wrangler deployments list --name nvx-stack-builder` ถ้าชื่อถูกใช้โดย Worker อื่นที่ไม่ใช่ของเรา เปลี่ยน `name` และ `services[0].service` ใน `wrangler.jsonc` เป็น `nvx-stack-builder-staging`
4. **Deploy**: `npm run deploy` (= build + `opennextjs-cloudflare deploy`) ครั้งแรกจะสร้าง Worker และ rate-limit bindings
5. **Secret**: `printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY`
6. **บันทึก version id** จากผลลัพธ์ (ใช้ rollback)
7. **Smoke test** (ด้านล่าง)
8. อัปเดตสถานะใน DEPLOY.md และ CHANGELOG

## Smoke test หลัง deploy

```bash
BASE=https://devstack.bid   # production; สำรอง https://nvx-stack-builder.examplessdk.workers.dev; v0.3.0 เดิม: https://nvx-stack-builder.agen-sdk-work.workers.dev
for p in / /templates /templates/nextjs-dashboard /builder /design; do curl -s -o /dev/null -w "$p %{http_code}\n" $BASE$p; done
curl -s -o /dev/null -w "404 check %{http_code}\n" $BASE/templates/does-not-exist     # ต้อง 404
curl -sI $BASE/ | grep -iE 'strict-transport|content-security|x-frame'
curl -s $BASE/api/plan                                                               # serverKeyConfigured: true
curl -s -X POST $BASE/api/plan -H 'content-type: application/json' \
  -d '{"prompt":"แดชบอร์ดยอดขาย Next.js","lang":"th"}' | head -c 300                  # source: openai
```

ทดสอบ rate limit: ส่ง POST แบบ `mode: "fallback"` 21 ครั้งใน 1 นาทีบน connection เดียว (`curl --next` หรือ keep-alive) ครั้งที่ 21 ต้องได้ 429 พร้อม `Retry-After: 60` หมายเหตุ: ถ้าเครื่องทดสอบออกเน็ตด้วย IPv6 ที่หมุนทุก connection (เช่น WARP) ให้ทดสอบบน connection เดียว

## สิ่งที่การ deploy สร้าง

- Worker script `nvx-stack-builder` + static assets
- rate-limit bindings `NVX_PLAN_LIMITER` (4712), `NVX_PLAN_AI_LIMITER` (4711) — เป็น config ไม่ใช่ resource แยก
- secret `OPENAI_API_KEY`
- **ไม่สร้าง** KV, R2, D1, route, DNS record

## ค่าใช้จ่าย

Workers มี free tier; ค่าใช้จ่ายหลักคือ OpenAI ซึ่งถูกจำกัดด้วย AI limiter (5/นาที/IP) และ `OPENAI_MAX_OUTPUT_TOKENS` ดู [rate-limits-cost.md](./rate-limits-cost.md)

## ต่อไป

[rollback.md](./rollback.md), [monitoring.md](./monitoring.md), [custom-domain.md](./custom-domain.md)

## บันทึก deploy v0.5.0 (11 ต.ค. 2026)

- **ตรวจบัญชีก่อน:** ใช้ GET แบบอ่านอย่างเดียว (`/accounts/<id>/workers/scripts` และ `/workers/subdomain`) เพราะ wrangler ไม่มีคำสั่ง list Worker ผลที่ได้: มี Worker เดิม 1 ตัว (`odd-violet-5e66`, ไม่แตะ), subdomain `space6` ลงทะเบียนไว้แล้ว และชื่อ `nvx-stack-builder` ยังว่าง จึงไม่ต้องใช้ `-staging`
- **deploy:** `opennextjs-cloudflare deploy` จาก build ที่ผ่าน preview test แล้ว ได้ version `107ab78e-2cdd-4159-95e7-e8fcb89130aa` (08:47 ICT) แล้วตั้ง secret ผ่าน stdin ได้ version `d369f2b6-863a-4e44-8f9e-b5551e18361a`
- **smoke test:** ผ่านทุกข้อ (หน้า, 404, headers, asset แบรนด์, AI ภาษาไทยได้ `source: "openai"`, 429 พร้อม `Retry-After: 60`) ภาพหน้าจอจากเว็บจริงอยู่ที่ `screenshots/v0.5/live-*`
- **ข้อสังเกต:** ตัวนับ rate limit เป็นแบบ eventually consistent จึงอาจได้ 200 เกิน limit 1 ครั้ง และ request ที่เปิด connection ใหม่จาก box นี้อาจออกจาก IP คนละตัว ให้ทดสอบ rate limit บน connection เดียว (`curl --next`)

## บันทึก deploy v0.5.1: โดเมน devstack.bid (11 ต.ค. 2026)

- **ตรวจ token:** token DEVSTACK อยู่บัญชีเดียวกันแต่ไม่มีสิทธิ์ Workers Scripts จึงใช้ token EXAMPLESSDK (Workers Scripts: Edit + Zone: Read) ผูกโดเมนผ่าน `PUT /accounts/{id}/workers/domains` ได้ทั้ง `devstack.bid` และ `www.devstack.bid` และ Cloudflare สร้าง `AAAA 100::` แบบ proxied ให้เอง
- **โค้ด:** `routes` (custom_domain) ใน `wrangler.jsonc`, redirect www → apex ใน `next.config.ts`, `metadataBase` = devstack.bid, HSTS ไม่มี includeSubDomains แล้ว deploy ได้ version `671b6b3b-1074-40cb-84b0-0df2681b69ce` (09:15 ICT)
- **ใบรับรอง:** ออกทันที (Google Trust Services, SAN `devstack.bid` + `*.devstack.bid`)
- **smoke test บนโดเมน:**
  - ทุกหน้าได้ 200 และ 404 จริง; www ตอบ 308 พร้อมคง path/query
  - headers ครบ (HSTS `max-age=31536000`); `og:image` เป็น `https://devstack.bid/opengraph-image.png…` และโหลดได้
  - AI ภาษาไทยได้ `source: "openai"` (35 วินาที) และ 429 พร้อม `Retry-After: 60` หลัง 20 ครั้ง
  - มาสคอตขยับและตามองตามเมาส์
  - ภาพหน้าจออยู่ที่ `screenshots/v0.5/domain-*`
- **ข้อสังเกต:**
  - prompt ที่ซับซ้อนกว่า 1 ครั้งเกิน `OPENAI_TIMEOUT_MS` (75 วินาที) จึงได้ offline planner ซึ่งเป็นพฤติกรรมที่ออกแบบไว้
  - Cloudflare Web Analytics แทรก beacon ที่ CSP บล็อก ดู [custom-domain.md](./custom-domain.md)
