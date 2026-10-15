# CLI setup + deploy zip: verification rounds (2026-10-15, local only)

Setup: `next dev` on 127.0.0.1:3100 with local D1 (`wrangler d1 migrations apply nvx-db --local`, 0001–0011), `scripts/verify/mock-cloudflare.mjs` on 127.0.0.1:18790 (dev-only `DEVSTACK_DEV_CF_API_BASE`, ignored in production and for non-127.0.0.1 hosts), runner `scripts/verify/cli-zip-round.sh <n>`. Linux x86_64 box, so setup.sh printed its macOS arm64 warning and continued. No production deploy, no remote migration, no real Cloudflare token (a dummy string validated by the mock).

Each round: register account → create `cli:setup` key → `curl /setup.sh | bash -s -- app-rN` → folder + zip present, key never printed → `npx wrangler@4 deploy --dry-run` inside the unzipped folder → connect (mock) Cloudflare → upload zip in /projects API → deploy live (mock workers.dev URL) → failing Worker deploy recorded `failed` with sanitized log → re-upload fixed zip + Retry → live → secret-looking content rejected (422) → download zip from /projects, Studio bundle route, chat bundle route → revoke key → `/api/cli/whoami` 401 and setup.sh exits non-zero.

| Round | Result | Notes |
| --- | --- | --- |
| 0 (dry start) | 2/19 | Local env only: `CHAT_COOKIE_SECRET` not in `process.env` under `next dev` (fixed via local `.env.local`, not committed); `zip` not installed on the box (runner now zips with Python). Found **bug**: setup.sh `[ -r /dev/tty ]` is true without a controlling terminal → crash instead of a clear error. **Fixed**: `has_tty` opens /dev/tty in a subshell. |
| 0b | 9/19 | Mock port 8790 was taken by a box service → moved mock to 18790. |
| 1 | 18/19 | "fixed zip + retry" FAIL was a runner bug (sed read the older deployment's status). Product state was correct (newest deployment `live`). Runner now parses JSON. |
| 2 | **19/19** | — |
| 3 | **19/19** | — |

Also run (Node 20): `eslint`, `tsc --noEmit`, `npm test` 337/337 (incl. per-template zip structure, upload validation, zip-slip, secret scan, mock-base guard), Studio `tsc -b` + export tests 5/5, `shellcheck` 0.10.0 on setup.sh and the runner: clean.

Not covered: a real Cloudflare account (mock only), a real macOS arm64 machine, the chat-bot `apply_fix` tool end-to-end for upload projects (unit-level only), Studio/chat buttons clicked in a browser (routes exercised by API).
