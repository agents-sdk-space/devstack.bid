# Secrets Store key, Remember/Environment, R2 chat archive: verification rounds (2026-10-15, local only)

Setup: `next dev` on 127.0.0.1:3100 (Node 22, OpenNext dev platform proxy) with local D1 migrations 0001–0012, a **local** Secrets Store secret `CREDENTIALS_KEY` (random, piped to `wrangler secrets-store secret create` without `--remote`, never printed), local R2 bucket `nvx-chat-streams`, and `scripts/verify/mock-cloudflare.mjs` on 127.0.0.1:18790 (`DEVSTACK_DEV_CF_API_BASE`, dev only). Runner: `scripts/verify/env-remember-round.sh <n>`. No production deploy, no remote migration, no real customer token. The chat turn used Workers AI (remote binding, one short message per round).

Each round (17 checks): register → `GET /api/environment` empty with `encryption: v2` (key read from the Secrets Store binding) → Connections PUT with Remember off returns `remembered:false` and stores nothing → upload zip → deploy with no token is 401 → deploy with a one-off token goes live and the token is not stored or echoed → save `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` to Environment; bad name 400; list shows names/dates only (no value, no ciphertext) → deploy with no token uses the remembered entries and stamps `lastUsedAt` → D1 rows are `v2.` ciphertext without plaintext → Connections PUT with Remember on saves and appears as a connection → deletes clear everything → cross-site POST 403, anonymous GET 401 → one chat turn: R2 object `chat/<uid>/<conversationId>/<messageId>.json` exists (meta, status, delta, text, usage, done) and D1 still has both messages.

| Round | Result | Notes |
| --- | --- | --- |
| 0 (dry start) | 3/17 | **Bug found and fixed:** under the dev platform proxy `env.CREDENTIALS_KEY.get()` returned a non-native thenable (`.then is not a function`); the read is now wrapped in `Promise.resolve().then(...)`. Runner mistake: mock base lacked `/client/v4`, so the fake token went to the real API and was rejected. |
| 0b | 12/17 | **Bug found and fixed (pre-existing since PR-A):** `gate()` passed `perMinute` but the Workers rate-limit binding `NVX_CHAT_LIMITER` is fixed at 4 / 60 s per key, so page loads and the 3-second deploy-status polling hit 429 quickly. Reads now use the per-isolate limiter at their `perMinute`; writes keep the shared 4/min binding. |
| 1 | **17/17** | — |
| 2 | **17/17** | — |
| 3 | **17/17** | — |

Also (Node 20): eslint, `tsc --noEmit`, `npm test` (incl. `tests/environment.test.ts`: Secrets Store read/caching/fallback, Environment seal/list/load/delete and user+name binding, provider URLs, R2 recorder merge/drop rules), `npm run build`, `docs:check`.

Token page URLs checked against provider docs on 2026-10-15: Cloudflare (developers.cloudflare.com create-token page links `dash.cloudflare.com/profile/api-tokens`), GitHub (docs link `github.com/settings/personal-access-tokens/new`), OpenAI (quickstart links `platform.openai.com/api-keys`), Vercel (REST API docs link `vercel.com/account/tokens`, which redirects to `/account/settings/tokens`), Hugging Face (security-tokens docs link `huggingface.co/settings/tokens`).

Not covered: the production Secrets Store binding (goes live at the next deploy), a real R2 bucket (R2 API still answered "enable R2" for the account on 2026-10-15 20:47 ICT), UI clicked in a real browser (pages return 200; flows exercised through the API).
