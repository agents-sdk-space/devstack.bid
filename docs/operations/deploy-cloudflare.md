# Deploy ไป Cloudflare Workers

> คู่มือฉบับเต็มทีละคำสั่ง (TH + EN) คือ **[DEPLOY.md](../DEPLOY.md)** หน้านี้ไม่คัดลอกซ้ำ แต่สรุปกระบวนการ เหตุผล และ checklist ที่ต้องทำทุกครั้ง

## นโยบาย (ต้องอ่านก่อน)

- **การ deploy ทุกครั้งต้องได้รับอนุมัติจากมนุษย์** ระบุบัญชี ชื่อ Worker และขอบเขตอย่างชัดเจน
- deploy เฉพาะ **Worker ใหม่ชื่อ `nvx-stack-builder`** บน **workers.dev เท่านั้น** ห้ามเพิ่ม `routes`, custom domain, DNS
- **ห้ามแก้หรือลบ Worker/resource อื่น** ในบัญชี (เช่น `agents-sdk-space`, `agent-starter`, `mcp-worker` ฯลฯ) และห้ามแตะ zone `agents-sdk.space`
- ห้าม `git push` ถ้าไม่ได้รับคำสั่ง ห้ามพิมพ์ secret

## ขั้นตอนโดยสรุป

1. **ตรวจโค้ด**: `npm run lint && npm run typecheck && npm test && npm run docs:check && npm run cf:build`
2. **ตั้งตัวแปร**: `CLOUDFLARE_API_TOKEN` (เฉพาะ token), `CLOUDFLARE_ACCOUNT_ID` (บัญชีทดสอบ `f70d35188a3c56b9781538c73a86e04e`)
3. **ตรวจชื่อว่าง/เป็นของเรา**: `npx wrangler deployments list --name nvx-stack-builder` ถ้าชื่อถูกใช้โดย Worker อื่นที่ไม่ใช่ของเรา เปลี่ยน `name` และ `services[0].service` ใน `wrangler.jsonc` เป็น `nvx-stack-builder-staging`
4. **Deploy**: `npm run deploy` (= build + `opennextjs-cloudflare deploy`) ครั้งแรกจะสร้าง Worker และ rate-limit bindings
5. **Secret**: `printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY`
6. **บันทึก version id** จากผลลัพธ์ (ใช้ rollback)
7. **Smoke test** (ด้านล่าง)
8. อัปเดตสถานะใน DEPLOY.md และ CHANGELOG

## Smoke test หลัง deploy

```bash
BASE=https://nvx-stack-builder.agen-sdk-work.workers.dev
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
