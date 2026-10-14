# Deploying NVX Stack Builder to Cloudflare Workers

> **Current production (2026-10-14):** live at **https://devstack.bid** (apex). Worker `nvx-stack-builder` in account `[account ID redacted]`; `www.devstack.bid` is also attached and returns 308 to the apex.
> - Current version: 2026-10-14 23:19 ICT, Cloudflare version `[deployment ID redacted]`. Secret `CURSOR_APP_ID` is the public Origin app `[application ID redacted]`. `GET /api/auth/cursor` returns 302 to `https://cursor.com/codebase/apps/install` (callback `https://devstack.bid/api/auth/cursor/callback`). Same code as the `/learn` deploy. Rollback target: `[deployment ID redacted]` (drops this secret).
> - Previous code deploy: 2026-10-14 22:18 ICT from merge commit `[commit redacted]` (pull request #6); Cloudflare version `[deployment ID redacted]`. This adds `/learn` and Setup Cursor. Rollback target: `[deployment ID redacted]`.
> - Previous code deploy: 2026-10-14 21:11 ICT from commit `[commit redacted]`; Cloudflare version `[deployment ID redacted]`. This is Studio (`/studio/`), the remote MCP server, and the sign-in work together. Rollback target: `[deployment ID redacted]`.
> - Previous code deploy: 2026-10-14 15:44 ICT from commit `[commit redacted]`; Cloudflare version `[deployment ID redacted]`. The vulnerable development dependency path was removed. D1 migration `0008_mcp_clients.sql` was applied to `nvx-db` before that deploy. Rollback target cited for that deploy: `[deployment ID redacted]`.
> - Live checks on that deploy passed: MCP discovery, protocol initialization, 19 tools, Thai privacy-guidance tool response, settings page, and unauthenticated key API returns 401.
> - Earlier the same day, version `[deployment ID redacted]` set the GitHub, Google, and AI Gateway secrets. Worker secrets stay on later versions unless removed. Rolling back to `[deployment ID redacted]` drops those secrets. Code rollback before sign-in: `[deployment ID redacted]`.
> - Previous production versions: `[deployment ID redacted]` (v0.6.0), `[deployment ID redacted]` (v0.5.1), then `[deployment ID redacted]` (v0.5.0) and `[deployment ID redacted]`. The D1 binding deploy remains `[deployment ID redacted]`.
> - Studio, MCP, and `/learn` are in this production version. `CURSOR_APP_ID` is set; the earlier Worker secrets remain.
> - workers.dev fallback: workers.dev URL redacted The account's subdomain was renamed from `previous subdomain redacted` to `production subdomain redacted` on 2026-10-11, so the old `previous subdomain redacted` URL no longer resolves.
> - HSTS is now `max-age=31536000`, without `includeSubDomains`/`preload`.
> - Details, created records and token permissions: [operations/custom-domain.md](operations/custom-domain.md).
>
> **v0.5.0 (2026-10-11), history:** first deployed at workers.dev URL redacted that URL was retired by the subdomain rename (Worker `nvx-stack-builder`, account `[account ID redacted]` "Cloudflare account", workers.dev subdomain `previous subdomain redacted`, no routes or custom domains). Deployed 2026-10-11 08:47 ICT from commit `[commit redacted]` (released as tag `v0.5.0`). Verified live:
> - all pages 200 (including the 10 template pages); `/templates/unknown` and `/definitely-missing` return a real 404
> - security headers on pages, and `Cache-Control` on `/brand/*`
> - manifest, favicon, icons and the OG image are served
> - no horizontal scroll at 1440px or 390px, in Thai or English; no console errors
> - the mascot animates and goes static under reduced motion
> - `/api/plan`: 415/413/400; a Thai prompt returns `source: "openai"` (gpt-6.1-sol); after 20–21 POSTs/min it returns 429 with `Retry-After: 60`
>
> v0.5.0 versions: `[deployment ID redacted]` (code + `OPENAI_API_KEY` secret, the rollback target before v0.5.1); `[deployment ID redacted]` (same code before the secret was set, so the AI agent falls back to the offline planner). That account has no earlier versions. The only other Worker in the account, `other Worker name redacted`, was not touched.
>
> **Previous test deployment (unchanged, still live):** workers.dev URL redacted (account `[account ID redacted]`, v0.3.0, version `[deployment ID redacted]`, earlier `[deployment ID redacted]`). It is left untouched on purpose and still serves the v0.3.0 design.

- [English](#english)
- [ภาษาไทย](#ภาษาไทย)

---

## English

### 1. Requirements

- Node.js **22+** for Wrangler 4 (`wrangler` refuses Node 20). Next.js itself runs on Node 20.9+.
- A Cloudflare account and an API token (see [Token permissions](#token-permissions)).
- `npm install`. It runs `postinstall` → `scripts/patch-opennext.mjs`, which patches `@opennextjs/cloudflare` so it also loads Next 16.4's `preview-props.json`. The patch is idempotent and safe to re-run.

### 2. Local development

```bash
npm install
cp .dev.vars.example .dev.vars    # put OPENAI_API_KEY=... (never commit; gitignored)
npm run dev                       # Next.js dev server, http://localhost:3000
npm run preview                   # build for Workers + run in workerd, http://localhost:8787
```

`npm run dev` also uses `.dev.vars` and the Cloudflare bindings, through `initOpenNextCloudflareForDev()`.

Checks: `npm run lint && npm run typecheck && npm test && npm run cf:build`.

### 3. Configuration

| Name | Kind | Where | Default |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | **secret** | `wrangler secret put` / `.dev.vars` | none → offline planner |
| `OPENAI_MODEL` | var | `wrangler.jsonc` `vars` | `gpt-6.1-sol` |
| `OPENAI_MAX_OUTPUT_TOKENS` | var | `wrangler.jsonc` | `6000` (hard cap 16000) |
| `OPENAI_TIMEOUT_MS` | var | `wrangler.jsonc` | `75000` in wrangler, `60000` in code |
| `NVX_PLAN_LIMITER` | rate-limit binding | `wrangler.jsonc` `ratelimits` (namespace `4712`) | 20 req / 60 s per IP, all POSTs |
| `NVX_PLAN_AI_LIMITER` | rate-limit binding | `wrangler.jsonc` `ratelimits` (namespace `4711`) | 5 req / 60 s per IP, shared server key only |
| `PLAN_LIMIT_PER_MIN`, `PLAN_AI_LIMIT_PER_MIN` | var | only used by the in-memory fallback (non-Workers hosts) | 20 / 5 |

Rate-limit bindings are declared in config only. They are not a separate dashboard resource, and they are created when the Worker is deployed. Counters are per Cloudflare location and eventually consistent, so very fast bursts may let a few extra requests through, which is fine for abuse control. Clients are keyed by IP, and IPv6 clients by their /64 prefix.

Set the secret **via stdin** so it never appears in shell history or logs:

```bash
printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY
```

Users can still paste their own OpenAI key in the UI. It travels only in the `x-openai-key` header of that single request, isn't rate-limited by the AI limiter, and is never stored or logged.

### 4. Deploy to the configured production domains

```bash
export CLOUDFLARE_API_TOKEN=...          # use a narrowly scoped token; never commit it
export CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID   # production account
# Or authenticate interactively with `npx wrangler login --device`, then confirm with `npx wrangler whoami`.

# 1) confirm the account and inspect the existing production Worker
npx wrangler whoami
npx wrangler deployments list --name nvx-stack-builder
#    Stop if the account or Worker is not the intended production target.

# 2) review D1 migrations; apply only after owner approval
npm run db:migrations:list
npm run db:migrate:remote

# 3) build + deploy this Worker and its configured custom domains
npm run deploy                            # = opennextjs-cloudflare build && opennextjs-cloudflare deploy

# 4) secret (after the worker exists)
printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY

# 5) verify the production domain and MCP discovery
curl -sI https://devstack.bid/ | grep -iE 'strict-transport|content-security'
curl -fsS https://devstack.bid/.well-known/mcp
```

`wrangler.jsonc` sets `workers_dev: true`, `preview_urls: false`, and the approved Workers Custom Domains `devstack.bid` and `www.devstack.bid`. A deploy updates this Worker and those configured domains; do not add other routes or domains without approval. GitHub is not linked to Cloudflare for automatic deployments.

### 5. Rollback

```bash
npx wrangler deployments list --name nvx-stack-builder
npx wrangler rollback <version-id> --name nvx-stack-builder -m "reason"
# or stop serving the test worker entirely:
npx wrangler delete --name nvx-stack-builder      # only this worker
```

Secrets and vars belong to versions. A rollback restores the previous version's code and bindings.

### 6. Later: binding `agents-sdk.space` (NOT done; plan only)

Current state: zone `agents-sdk.space` (`[account ID redacted]`) has a proxied apex `AAAA 100::` placeholder record. That pattern is used for Worker routes, and the existing Worker **`agents-sdk-space`** most likely serves the apex through a route or custom domain.

Steps, when the owner approves:

1. Decide: replace `agents-sdk-space` on the apex, or use a subdomain such as `stack.agents-sdk.space` (no conflict, recommended for a first rollout).
2. Token: add **Zone › Zone: Read**, **Zone › Workers Routes: Edit** and **Zone › DNS: Edit** for that zone, and include the account `9d56…34d1`.
3. If you take over the apex, first remove the apex route or custom domain from `agents-sdk-space` (Workers → agents-sdk-space → Settings → Domains & Routes). Delete the `AAAA 100::` record only if no route still needs it. A custom domain creates its own DNS record and conflicts with an existing record for the same name.
4. Add to `wrangler.jsonc`:
   ```jsonc
   "routes": [{ "pattern": "stack.agents-sdk.space", "custom_domain": true }]
   ```
   then `npm run deploy`, or use Dashboard → Worker → Domains & Routes → Add Custom Domain.
5. HSTS: since v0.5.1 the app sends `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`), because it now runs on the devstack.bid apex. The older value `max-age=31536000; includeSubDomains` would have applied as described next. On the apex this applies to **all subdomains**, so make sure all of them serve HTTPS. Don't add `preload` until you're sure.
6. Optionally set `workers_dev: false` once the domain works.

### 7. Token permissions

Each test account uses its own account-scoped token. The v0.3.0 token (`restless-heart-ac34`) covers only `f70d…e04e`. The v0.5.0 deploy used a separate token scoped to `2d92…87fc`, passed only as `CLOUDFLARE_API_TOKEN` to wrangler and never printed or stored. Its `/user/tokens/verify` returns non-JSON, which is normal for account tokens: check them with `/accounts/<id>/tokens/verify` or `wrangler whoami`. To deploy to yet another account:

Minimum for the test deploy (account-scoped token, resources must include account `[account ID redacted]`):

- Account › **Workers Scripts: Edit** (upload, secrets, versions, rollback, rate-limit bindings)
- Account › **Account Settings: Read** (whoami, workers.dev subdomain)
- Optional: Account › Workers Observability: Edit, Workers Tail: Read

### 8. Files added/changed for Cloudflare

`wrangler.jsonc`, `open-next.config.ts`, `cloudflare-env.d.ts`, `.dev.vars.example`, `public/_headers`, `scripts/patch-opennext.mjs`, `next.config.ts` (headers, 404 rewrite, dev bindings), `src/lib/server/{env,http,rate-limit}.ts`, `src/lib/security-headers.ts`, `src/data/template-ids.ts`, `src/app/api/plan/route.ts`, `src/lib/ai/openai.ts`, `tests/production.test.ts`, `vitest.config.mts`, `package.json`, `.gitignore`.

---

## ภาษาไทย

> **Production ปัจจุบัน (14 ต.ค. 2026):** เสิร์ฟที่ **https://devstack.bid** ผ่าน Workers Custom Domain ของ Worker `nvx-stack-builder`; `www.devstack.bid` redirect 308 ไป apex
> - deploy เวลา 15:44 ICT จาก commit `[commit redacted]`; Cloudflare version `[deployment ID redacted]` (นำ dependency ฝั่ง development ที่มีช่องโหว่ออกแล้ว); rollback target `[deployment ID redacted]`
> - apply D1 migration `0008_mcp_clients.sql` ก่อน deploy แล้ว; ตรวจ discovery, initialize, 19 MCP tools, คำแนะนำความเป็นส่วนตัวภาษาไทย, หน้า settings และ API คีย์ที่ไม่ล็อกอินตอบ 401 ผ่าน
> - workers.dev สำรองที่ workers.dev URL redacted HSTS เป็น `max-age=31536000` ไม่มี `includeSubDomains` ดู [operations/custom-domain.md](operations/custom-domain.md)
>
> **สถานะ v0.5.0 (11 ต.ค. 2026):** deploy ครั้งแรกที่ **workers.dev URL redacted (URL นี้ใช้ไม่ได้แล้ว) (Worker `nvx-stack-builder` บัญชี `[account ID redacted]` "Cloudflare account" subdomain `previous subdomain redacted` ใช้ workers.dev เท่านั้น) deploy เมื่อ 11 ต.ค. 2026 08:47 (ICT) จาก commit `[commit redacted]` (tag `v0.5.0`) ตรวจบนเว็บจริงผ่านทุกข้อ: ทุกหน้าได้ 200, 404 จริง, security headers, manifest/favicon/OG image, ไม่มี horizontal scroll ทั้งไทยและอังกฤษ, prompt ภาษาไทยได้ `source: "openai"`, rate limit ตอบ 429 พร้อม `Retry-After: 60` เวอร์ชันสำหรับ rollback: `[deployment ID redacted]` (ปัจจุบัน) และ `[deployment ID redacted]` (โค้ดเดียวกันแต่ยังไม่ตั้ง secret) Worker เดิม `other Worker name redacted` ในบัญชีนั้นไม่ถูกแตะ
>
> deploy ทดสอบเดิม (v0.3.0) ที่ workers.dev URL redacted บัญชี `[account ID redacted]` ยังอยู่และไม่ถูกแก้ไข (เวอร์ชัน `[deployment ID redacted]`)

### 1. สิ่งที่ต้องมี
- Node.js **22 ขึ้นไป** สำหรับ Wrangler 4
- บัญชี Cloudflare และ API token ที่มีสิทธิ์ตามหัวข้อ 7
- `npm install` จะรัน `scripts/patch-opennext.mjs` ให้อัตโนมัติ เพื่อแก้ adapter ให้รองรับ `preview-props.json` ของ Next 16.4

### 2. รันบนเครื่อง
```bash
npm install
cp .dev.vars.example .dev.vars   # ใส่ OPENAI_API_KEY (ห้าม commit)
npm run dev        # http://localhost:3000
npm run preview    # รันใน Workers runtime ที่ http://localhost:8787
```

### 3. ตัวแปรและ secret
- `OPENAI_API_KEY` เป็น **secret** ตั้งผ่าน stdin เท่านั้น: `printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY`
- `OPENAI_MODEL` (ค่าเริ่มต้น `gpt-6.1-sol`), `OPENAI_MAX_OUTPUT_TOKENS` (6000, สูงสุด 16000), `OPENAI_TIMEOUT_MS` ตั้งใน `vars` ของ `wrangler.jsonc`
- Rate limit: `NVX_PLAN_LIMITER` 20 ครั้งต่อนาทีต่อ IP สำหรับทุก POST และ `NVX_PLAN_AI_LIMITER` 5 ครั้งต่อนาทีต่อ IP เฉพาะเมื่อใช้ key ของเซิร์ฟเวอร์ binding ทั้งสองถูกสร้างพร้อมการ deploy
- key ที่ผู้ใช้ใส่เองถูกใช้แค่ในคำขอนั้น ไม่ถูกเก็บและไม่ถูกบันทึก log

### 4. Deploy ไปยัง production domains ที่ตั้งไว้
```bash
export CLOUDFLARE_API_TOKEN=...      # ใช้ token ที่จำกัดสิทธิ์และห้าม commit
export CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID   # ตรวจบัญชีด้วย npx wrangler whoami ก่อน
npm run db:migrations:list          # ตรวจ migration ก่อน
# หลังเจ้าของอนุมัติ migration เท่านั้น:
npm run db:migrate:remote
npm run deploy
printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY
```
คำสั่ง deploy อัปเดต Worker และ Custom Domains ที่อนุมัติไว้คือ `devstack.bid` กับ `www.devstack.bid` ใน `wrangler.jsonc`; Cloudflare ไม่ได้ผูก Git เพื่อ deploy อัตโนมัติ ห้ามเพิ่มโดเมนหรือ route อื่นโดยไม่อนุมัติ

### 5. ย้อนเวอร์ชัน (rollback)
```bash
npx wrangler deployments list --name nvx-stack-builder
npx wrangler rollback <version-id> --name nvx-stack-builder
```

### 6. ผูกโดเมน `agents-sdk.space` ภายหลัง (ยังไม่ได้ทำ)
1. เลือกว่าจะใช้ apex แทน Worker `agents-sdk-space` เดิม หรือใช้ subdomain เช่น `stack.agents-sdk.space` (แนะนำ เพราะไม่ชนกับของเดิม)
2. เพิ่มสิทธิ์ token: Zone Read, Workers Routes Edit, DNS Edit บน zone `[account ID redacted]`
3. ถ้าจะใช้ apex ต้องถอด route หรือ custom domain ของ `agents-sdk-space` ก่อน และพิจารณาลบ record `AAAA 100::` (proxied) ที่เป็น placeholder ของ route เดิม
4. เพิ่ม `"routes": [{ "pattern": "stack.agents-sdk.space", "custom_domain": true }]` แล้ว `npm run deploy`
5. HSTS: ตั้งแต่ v0.5.1 ไม่ส่ง `includeSubDomains` เพราะแอปอยู่บน apex ถ้าจะเพิ่มกลับ ทุก subdomain ต้องรองรับ HTTPS ก่อน

### 7. สิทธิ์ของ token ที่ต้องใช้
token ต้องมีบัญชี `[account ID redacted]` อยู่ใน resources และมีสิทธิ์ Account › **Workers Scripts: Edit** กับ Account › **Account Settings: Read** (ไม่บังคับ: Workers Observability Edit, Workers Tail Read)

### 8. ไฟล์ที่เพิ่มหรือแก้
ดูรายการในหัวข้อ 8 ของภาษาอังกฤษด้านบน
