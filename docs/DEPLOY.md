# Deploying NVX Stack Builder to Cloudflare Workers

> **Status (2026-10-10):** the app is fully adapted and verified in the local Workers runtime (`opennextjs-cloudflare preview`, workerd). The **live test deploy has not been done yet**: the Cloudflare API token available only grants access to a different account (see "Token permissions" below). No Cloudflare resources were created or modified.

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

Rate-limit bindings are declared in config only. They are not a separate dashboard resource, and they are created when the Worker is deployed. Counters are per Cloudflare location, which is fine for abuse control.

Set the secret **via stdin** so it never appears in shell history or logs:

```bash
printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY
```

Users can still paste their own OpenAI key in the UI. It travels only in the `x-openai-key` header of that single request, isn't rate-limited by the AI limiter, and is never stored or logged.

### 4. Deploy (workers.dev only)

```bash
export CLOUDFLARE_API_TOKEN=...          # only the token string, nothing else
export CLOUDFLARE_ACCOUNT_ID=9d56815c97f330febf9d6a0bb7f234d1

# 1) make sure the worker name is free (should say it does not exist)
npx wrangler deployments list --name nvx-stack-builder
#    If it exists and is not ours: change "name" (and the WORKER_SELF_REFERENCE
#    service) in wrangler.jsonc to "nvx-stack-builder-staging".

# 2) build + deploy (creates the Worker on first deploy)
npm run deploy                            # = opennextjs-cloudflare build && opennextjs-cloudflare deploy

# 3) secret (after the worker exists)
printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY

# 4) verify
curl -sI https://nvx-stack-builder.<subdomain>.workers.dev/ | grep -iE 'strict-transport|content-security'
curl -s https://nvx-stack-builder.<subdomain>.workers.dev/api/plan   # {"serverKeyConfigured":true,...}
```

`wrangler.jsonc` sets `workers_dev: true`, `preview_urls: false` and **no `routes`**, so the deploy never touches any zone, DNS or custom domain.

### 5. Rollback

```bash
npx wrangler deployments list --name nvx-stack-builder
npx wrangler rollback <version-id> --name nvx-stack-builder -m "reason"
# or stop serving the test worker entirely:
npx wrangler delete --name nvx-stack-builder      # only this worker
```

Secrets and vars belong to versions. A rollback restores the previous version's code and bindings.

### 6. Later: binding `agents-sdk.space` (NOT done; plan only)

Current state: zone `agents-sdk.space` (`dfb531c381f8e6dd75082a6fe964f71b`) has a proxied apex `AAAA 100::` placeholder record. That pattern is used for Worker routes, and the existing Worker **`agents-sdk-space`** most likely serves the apex through a route or custom domain.

Steps, when the owner approves:

1. Decide: replace `agents-sdk-space` on the apex, or use a subdomain such as `stack.agents-sdk.space` (no conflict, recommended for a first rollout).
2. Token: add **Zone › Zone: Read**, **Zone › Workers Routes: Edit** and **Zone › DNS: Edit** for that zone, and include the account `9d56…34d1`.
3. If you take over the apex, first remove the apex route or custom domain from `agents-sdk-space` (Workers → agents-sdk-space → Settings → Domains & Routes). Delete the `AAAA 100::` record only if no route still needs it. A custom domain creates its own DNS record and conflicts with an existing record for the same name.
4. Add to `wrangler.jsonc`:
   ```jsonc
   "routes": [{ "pattern": "stack.agents-sdk.space", "custom_domain": true }]
   ```
   then `npm run deploy`, or use Dashboard → Worker → Domains & Routes → Add Custom Domain.
5. HSTS: the app sends `Strict-Transport-Security: max-age=31536000; includeSubDomains`. On the apex this applies to **all subdomains**, so make sure all of them serve HTTPS. Don't add `preload` until you're sure.
6. Optionally set `workers_dev: false` once the domain works.

### 7. Token permissions

Minimum for the test deploy (account-scoped token, resources must include account `9d56815c97f330febf9d6a0bb7f234d1`):

- Account › **Workers Scripts: Edit** (upload, secrets, versions, rollback, rate-limit bindings)
- Account › **Account Settings: Read** (whoami, workers.dev subdomain)
- Optional: Account › Workers Observability: Edit, Workers Tail: Read

### 8. Files added/changed for Cloudflare

`wrangler.jsonc`, `open-next.config.ts`, `cloudflare-env.d.ts`, `.dev.vars.example`, `public/_headers`, `scripts/patch-opennext.mjs`, `next.config.ts` (headers, 404 rewrite, dev bindings), `src/lib/server/{env,http,rate-limit}.ts`, `src/lib/security-headers.ts`, `src/data/template-ids.ts`, `src/app/api/plan/route.ts`, `src/lib/ai/openai.ts`, `tests/production.test.ts`, `vitest.config.mts`, `package.json`, `.gitignore`.

---

## ภาษาไทย

> **สถานะ (10 ต.ค. 2026):** ปรับแอปให้รันบน Cloudflare Workers ครบแล้ว และทดสอบใน runtime ของ Workers บนเครื่อง (workerd) ผ่านทุกข้อ **แต่ยังไม่ได้ deploy จริง** เพราะ API token ที่มีเข้าถึงได้เฉพาะบัญชี Cloudflare อีกบัญชีหนึ่ง ไม่ได้สร้างหรือแก้ไข resource ใดบน Cloudflare

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

### 4. Deploy (workers.dev เท่านั้น)
```bash
export CLOUDFLARE_API_TOKEN=...      # ใส่เฉพาะตัว token
export CLOUDFLARE_ACCOUNT_ID=9d56815c97f330febf9d6a0bb7f234d1
npx wrangler deployments list --name nvx-stack-builder   # ตรวจว่าชื่อยังว่าง ถ้าไม่ว่างให้ใช้ nvx-stack-builder-staging
npm run deploy
printenv OPENAI_API_KEY | npx wrangler secret put OPENAI_API_KEY
```
ไฟล์ config ไม่มี `routes` จึงไม่แตะ zone, DNS หรือ custom domain ใด ๆ

### 5. ย้อนเวอร์ชัน (rollback)
```bash
npx wrangler deployments list --name nvx-stack-builder
npx wrangler rollback <version-id> --name nvx-stack-builder
```

### 6. ผูกโดเมน `agents-sdk.space` ภายหลัง (ยังไม่ได้ทำ)
1. เลือกว่าจะใช้ apex แทน Worker `agents-sdk-space` เดิม หรือใช้ subdomain เช่น `stack.agents-sdk.space` (แนะนำ เพราะไม่ชนกับของเดิม)
2. เพิ่มสิทธิ์ token: Zone Read, Workers Routes Edit, DNS Edit บน zone `dfb531c381f8e6dd75082a6fe964f71b`
3. ถ้าจะใช้ apex ต้องถอด route หรือ custom domain ของ `agents-sdk-space` ก่อน และพิจารณาลบ record `AAAA 100::` (proxied) ที่เป็น placeholder ของ route เดิม
4. เพิ่ม `"routes": [{ "pattern": "stack.agents-sdk.space", "custom_domain": true }]` แล้ว `npm run deploy`
5. ระวัง HSTS `includeSubDomains`: ทุก subdomain ต้องรองรับ HTTPS

### 7. สิทธิ์ของ token ที่ต้องใช้
token ต้องมีบัญชี `9d56815c97f330febf9d6a0bb7f234d1` อยู่ใน resources และมีสิทธิ์ Account › **Workers Scripts: Edit** กับ Account › **Account Settings: Read** (ไม่บังคับ: Workers Observability Edit, Workers Tail Read)

### 8. ไฟล์ที่เพิ่มหรือแก้
ดูรายการในหัวข้อ 8 ของภาษาอังกฤษด้านบน
