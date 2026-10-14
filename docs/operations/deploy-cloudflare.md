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

## บันทึก secret: CURSOR_APP_ID (14 ต.ค. 2026)

- **บัญชี:** `[account ID redacted]` ([email redacted]) Worker `nvx-stack-builder` เท่านั้น ไม่แตะ Worker อื่นและไม่สร้าง DNS ใหม่
- **โค้ด:** ไม่ได้ deploy โค้ดใหม่ ใช้โค้ดเดียวกับ version `[deployment ID redacted]` (merge `be6eb3f`)
- **วิธีตั้ง:** `printf '%s' '<app id>' | wrangler secret put CURSOR_APP_ID --name nvx-stack-builder` ผ่าน stdin เซสชัน Wrangler OAuth ของ `[email redacted]` (`env -u CLOUDFLARE_API_TOKEN` เพราะ token ในสภาพแวดล้อมถูกปฏิเสธด้วยรหัส `9109`) ไม่ได้พิมพ์ secret อื่น
- **เวอร์ชันของบันทึกนี้:** `[deployment ID redacted]` (23:19 ICT) ชื่อ secret บน Worker เพิ่ม `CURSOR_APP_ID` รหัสแอปสาธารณะคือ `[application ID redacted]` เว็บไม่เก็บ private key ของ Origin
- **ตรวจบนเว็บจริง:** `GET https://devstack.bid/api/auth/cursor` ตอบ 302 ไป `https://cursor.com/codebase/apps/install` พร้อม `client_id` นั้น, `scope=repository:metadata:read`, `redirect_uri=https://devstack.bid/api/auth/cursor/callback` และ `summary=Sign in to DevStack` (`cache-control: no-store`) ตอนยังไม่ล็อกอิน Cursor ตอบ 307 ไปหน้าล็อกอินของ Cursor และคง URL ติดตั้งไว้
- **rollback:** `[deployment ID redacted]` คืนโค้ด `/learn` เดิมและเอา secret `CURSOR_APP_ID` ออก ปุ่ม Cursor จะกลับไป `/login?auth=missing&provider=cursor`

## บันทึก deploy: หน้า /learn และ Setup Cursor (14 ต.ค. 2026)

- **บัญชี:** `[account ID redacted]` ([email redacted]) Worker `nvx-stack-builder` เท่านั้น ไม่แตะ Worker อื่นและไม่สร้าง DNS ใหม่
- **โค้ด:** merge commit `[commit redacted]` บน `main` (pull request #6)
- **deploy:** `npm run deploy` ด้วยเซสชัน OAuth ได้ version `[deployment ID redacted]` (22:18 ICT) โดเมน `devstack.bid` และ `www.devstack.bid` ยังอยู่ครบ ไม่ได้ตั้ง secret ใหม่
- **ตรวจบนเว็บจริง:** `/`, `/learn`, `/templates`, `/templates/nextjs-dashboard`, `/builder`, `/design`, `/chat`, `/docs`, `/login`, `/docs/platform` ได้ 200 `/templates/does-not-exist` ได้ 404 `www.devstack.bid/learn` ได้ 308 ไป apex หน้า `/learn` มี `[email redacted]` และลิงก์ `cursor.com/link/prompt` หน้าแรกชี้ไป `/learn` `POST /api/plan` แบบ fallback เลือก `nextjs-dashboard`
- **rollback:** `[deployment ID redacted]`

## บันทึก deploy: Studio + MCP บน production (14 ต.ค. 2026)

- **บัญชี:** `[account ID redacted]` ([email redacted]) Worker `nvx-stack-builder` เท่านั้น ไม่แตะ `other Worker name redacted` และไม่สร้าง DNS ใหม่
- **โค้ด:** `838440a` บน `main` (Studio, MCP, บันทึกล็อกอิน)
- **deploy:** `npm run deploy` ด้วยเซสชัน OAuth ได้ version `[deployment ID redacted]` (21:11 ICT) โดเมน `devstack.bid` และ `www.devstack.bid` ยังอยู่ครบ ไม่ได้ตั้ง secret ใหม่
- **ตรวจบนเว็บจริง:** ทุกหน้าเทมเพลต 10 แบบ, `/`, `/builder`, `/docs`, `/docs/platform`, `/docs/user-guide/studio`, `/chat`, `/factory`, `/login`, `/settings/mcp`, `/.well-known/mcp` และ `/api/studio/health` ได้ 200 `/studio/` ได้ 200 พร้อม COOP/COEP `/studio` ได้ 307 ไป `/studio/` `/templates/does-not-exist` ได้ 404 `www` ได้ 308 ไป apex `GET /mcp` ได้ 405 หน้าแรกมีคำสั่ง `nvm install --lts`, `create-next-app`, `npm install recharts` และ `npm run dev` `POST /api/plan` แบบ fallback เลือก `nextjs-dashboard` GitHub และ Google ยัง 302 ไปผู้ให้บริการ Cursor ยัง `auth=missing`
- **rollback:** `[deployment ID redacted]`

## บันทึก deploy: เข้าสู่ระบบสี่วิธีและเมนูฟังก์ชัน (14 ต.ค. 2026)

- **บัญชี:** `[account ID redacted]` ([email redacted]) Worker `nvx-stack-builder` เท่านั้น ไม่แตะ `other Worker name redacted`
- **deploy:** `npm run deploy` ได้ version `[deployment ID redacted]` โดเมน `devstack.bid` และ `www.devstack.bid` ยังอยู่ครบ
- **ตรวจบนเว็บจริง:** `/`, `/login`, `/docs/platform`, `/docs/agents/cursor-caretakers` ได้ 200; `/templates/unknown` ได้ 404; www `/login` ได้ 308 ไป apex
- **เข้าสู่ระบบ ณ ตอน deploy นี้:** migration `0006` และ `0007` apply บน remote แล้ว (`schema_version` = 7) รหัสผ่านของอีเมลที่ไม่มีบัญชีตอบ `303` `auth=invalid` ปุ่ม Cursor, Google, GitHub พาไป `/login?auth=missing` secret ของ GitHub กับ Google ถูกตั้งในบันทึกถัดไป
- **rollback:** `[deployment ID redacted]`

## บันทึก secret: GitHub, Google และ AI Gateway (14 ต.ค. 2026)

- **บัญชี:** `[account ID redacted]` Worker `nvx-stack-builder` เท่านั้น
- **วิธีตั้ง:** `wrangler secret put` ผ่าน stdin จากค่าที่ผู้ใช้กรอกในแบบฟอร์ม Runtime secret ไม่ได้พิมพ์ค่าลับ เซสชัน Wrangler OAuth ของ `[email redacted]` เป็นตัวเขียน secret เพราะ `CLOUDFLARE_API_TOKEN` ที่กรอกมาถูก Cloudflare ปฏิเสธด้วยรหัส `9109`
- **เวอร์ชันของบันทึกนี้:** `[deployment ID redacted]` secret ที่มีชื่อบน Worker ตอนนั้นคือ `AI_GATEWAY_API_KEY`, `CHAT_COOKIE_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `HF_TOKEN`, `OPENAI_API_KEY` (`CURSOR_APP_ID` ถูกตั้งในบันทึกด้านบน)
- **ตรวจบนเว็บจริง:** `GET /api/auth/github` ตอบ 302 ไป `github.com/login/oauth/authorize` และ `GET /api/auth/google` ตอบ 302 ไป `accounts.google.com/o/oauth2/v2/auth` ไม่ได้ตาม query เพราะมี client id `GET /api/auth/cursor` ยังตอบ 302 ไป `/login?auth=missing&provider=cursor` เพราะไม่ได้กรอก `CURSOR_APP_ID`
- **rollback:** `[deployment ID redacted]` คืนโค้ดเดิมและเอา secret GitHub, Google, AI Gateway ออก

## บันทึก deploy: เพิ่ม D1 binding (11 ต.ค. 2026)

- สร้าง D1 `nvx-db` (`[deployment ID redacted]`, WNAM) แล้ว apply migration `0001` และ `0002` บน remote ([d1-database.md](./d1-database.md))
- deploy จาก branch `feat/d1-chat-schema` หลังจาก lint, typecheck, tests, docs:check และ cf:build ผ่าน; ได้ version `[deployment ID redacted]`; binding `env.DB (nvx-db)`; custom domain ยังอยู่ครบ
- ตรวจบนเว็บจริง:
  - ทุกหน้าได้ 200 และ 404 จริง
  - raw `.md` ทั้ง 46 ไฟล์ตรงกับต้นฉบับทุก byte
  - `GET /api/plan` ปกติ; www ตอบ 308
  - หน้า docs ใหม่และ ER diagram โหลดได้ ไม่มี console error นอกจาก beacon ของ Web Analytics
- rollback: `[deployment ID redacted]` (v0.6.0)

