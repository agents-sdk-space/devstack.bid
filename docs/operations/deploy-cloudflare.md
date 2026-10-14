# Deploy ไป Cloudflare Workers

> คู่มือฉบับเต็มทีละคำสั่ง (TH + EN) คือ **[DEPLOY.md](../DEPLOY.md)** หน้านี้ไม่คัดลอกซ้ำ แต่สรุปกระบวนการ เหตุผล และ checklist ที่ต้องทำทุกครั้ง

## นโยบาย (ต้องอ่านก่อน)

- **การ deploy ทุกครั้งต้องได้รับอนุมัติจากมนุษย์** ระบุบัญชี ชื่อ Worker และขอบเขตอย่างชัดเจน
- deploy เฉพาะ **Worker ใหม่ชื่อ `nvx-stack-builder`** บน **workers.dev เท่านั้น** ห้ามเพิ่ม `routes`, custom domain, DNS
- **ห้ามแก้หรือลบ Worker/resource อื่น** ในบัญชี (เช่น `agents-sdk-space`, `agent-starter`, `mcp-worker` ฯลฯ) และห้ามแตะ zone `agents-sdk.space`
- ห้าม `git push` ถ้าไม่ได้รับคำสั่ง ห้ามพิมพ์ secret

## ขั้นตอนโดยสรุป

1. **ตรวจโค้ด**: `npm run lint && npm run typecheck && npm test && npm run docs:check && npm run cf:build`
2. **ตั้งตัวแปร**: `CLOUDFLARE_API_TOKEN` (เฉพาะ token), `CLOUDFLARE_ACCOUNT_ID` (บัญชี production `[account ID redacted]`, devstack.bid, workers.dev `production subdomain redacted`; บัญชีเดิม v0.3.0 `[account ID redacted]`) ถ้าใช้ token หลายบัญชีบนเครื่องเดียว ให้ส่งเฉพาะคำสั่ง เช่น `CLOUDFLARE_API_TOKEN="$TOKEN_X" CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler ...` แทนการ export ค้างไว้
3. **ตรวจชื่อว่าง/เป็นของเรา**: `npx wrangler deployments list --name nvx-stack-builder` ถ้าชื่อถูกใช้โดย Worker อื่นที่ไม่ใช่ของเรา เปลี่ยน `name` และ `services[0].service` ใน `wrangler.jsonc` เป็น `nvx-stack-builder-staging`
4. **Deploy**: `npm run deploy` (= build + `opennextjs-cloudflare deploy`) ครั้งแรกจะสร้าง Worker และ rate-limit bindings
5. **Secret**: `printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY`
6. **บันทึก version id** จากผลลัพธ์ (ใช้ rollback)
7. **Smoke test** (ด้านล่าง)
8. อัปเดตสถานะใน DEPLOY.md และ CHANGELOG

## Smoke test หลัง deploy

```bash
BASE=https://devstack.bid   # production; สำรอง workers.dev URL redacted v0.3.0 เดิม: workers.dev URL redacted
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

- **ตรวจบัญชีก่อน:** ใช้ GET แบบอ่านอย่างเดียว (`/accounts/<id>/workers/scripts` และ `/workers/subdomain`) เพราะ wrangler ไม่มีคำสั่ง list Worker ผลที่ได้: มี Worker เดิม 1 ตัว (`other Worker name redacted`, ไม่แตะ), subdomain `previous subdomain redacted` ลงทะเบียนไว้แล้ว และชื่อ `nvx-stack-builder` ยังว่าง จึงไม่ต้องใช้ `-staging`
- **deploy:** `opennextjs-cloudflare deploy` จาก build ที่ผ่าน preview test แล้ว ได้ version `[deployment ID redacted]` (08:47 ICT) แล้วตั้ง secret ผ่าน stdin ได้ version `[deployment ID redacted]`
- **smoke test:** ผ่านทุกข้อ (หน้า, 404, headers, asset แบรนด์, AI ภาษาไทยได้ `source: "openai"`, 429 พร้อม `Retry-After: 60`) ภาพหน้าจอจากเว็บจริงอยู่ที่ `screenshots/v0.5/live-*`
- **ข้อสังเกต:** ตัวนับ rate limit เป็นแบบ eventually consistent จึงอาจได้ 200 เกิน limit 1 ครั้ง และ request ที่เปิด connection ใหม่จาก box นี้อาจออกจาก IP คนละตัว ให้ทดสอบ rate limit บน connection เดียว (`curl --next`)

## บันทึก deploy v0.5.1: โดเมน devstack.bid (11 ต.ค. 2026)

- **ตรวจ token:** The DNS-only token belongs to the same account but lacks Workers Scripts permission, so deployment used a token with Workers Scripts: Edit and Zone: Read. Cloudflare then attached both `devstack.bid` and `www.devstack.bid` and created the proxied `AAAA 100::` records.
- **โค้ด:** `routes` (custom_domain) ใน `wrangler.jsonc`, redirect www → apex ใน `next.config.ts`, `metadataBase` = devstack.bid, HSTS ไม่มี includeSubDomains แล้ว deploy ได้ version `[deployment ID redacted]` (09:15 ICT)
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

## บันทึก deploy v0.6.0: docs ในแอป + signature (11 ต.ค. 2026)

- **ที่มา:** merge `feat/docs-site` เข้า `main` แล้ว bump เป็น 0.6.0; lint, typecheck, tests, docs:check และ cf:build ผ่านทั้งหมดก่อน deploy
- **deploy:** ใช้ deployment token; ได้ version `[deployment ID redacted]` (11:18 ICT) ขนาด upload 9467.97 KiB (gzip 1810.44 KiB); custom domain devstack.bid + www ยังอยู่ครบ
- **ตรวจบนเว็บจริง:**
  - ทุกหน้า รวม `/docs` และหน้าย่อย ได้ 200; slug ที่ไม่มีได้ 404 จริง
  - raw `.md` ทั้ง 43 ไฟล์ตรงกับต้นฉบับทุก byte (`text/markdown`, ACAO `*`); manifest ก็ตรง
  - `/llms.txt` มีลิงก์ 43 รายการ; `/llms-full.txt` ขนาด 336 KB
  - headers ครบ; www ตอบ 308
  - AI ภาษาไทยได้ `source: "openai"`
  - signature อยู่ใน footer ทุกหน้า; touch glow ทำงาน
  - ภาพหน้าจออยู่ที่ `screenshots/v0.6/live-*`
- **ข้อสังเกต:** console มี error จาก CSP บล็อก `static.cloudflareinsights.com/beacon.min.js` (Web Analytics ที่ Cloudflare ฉีดเข้ามา) ไม่มีผลกับการทำงาน; จะเปิดใน CSP หรือปิด Web Analytics ต้องให้ผู้ใช้ตัดสินใจ
- **rollback:** `[deployment ID redacted]` (v0.5.1)

## บันทึก deploy: เพิ่ม D1 binding (11 ต.ค. 2026)

- สร้าง D1 `nvx-db` (`[deployment ID redacted]`, WNAM) แล้ว apply migration `0001` และ `0002` บน remote ([d1-database.md](./d1-database.md))
- deploy จาก branch `feat/d1-chat-schema` หลังจาก lint, typecheck, tests, docs:check และ cf:build ผ่าน; ได้ version `[deployment ID redacted]`; binding `env.DB (nvx-db)`; custom domain ยังอยู่ครบ
- ตรวจบนเว็บจริง:
  - ทุกหน้าได้ 200 และ 404 จริง
  - raw `.md` ทั้ง 46 ไฟล์ตรงกับต้นฉบับทุก byte
  - `GET /api/plan` ปกติ; www ตอบ 308
  - หน้า docs ใหม่และ ER diagram โหลดได้ ไม่มี console error นอกจาก beacon ของ Web Analytics
- rollback: `[deployment ID redacted]` (v0.6.0)

