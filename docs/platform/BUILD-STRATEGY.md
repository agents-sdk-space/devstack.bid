# Build Strategy: Workers Builds vs Cloudflare Containers vs GitHub Actions

Constraint from spec + code: untrusted customer code must never run in the main `nvx-stack-builder` Worker; the existing direct-upload path (no build) stays for static/plain-Worker projects. Figures below are planning numbers as understood on 2026-10-22 — **re-check Cloudflare/GitHub pricing pages before the owner approves spend.**

| | Workers Builds (customer's CF account) | Cloudflare Containers (DevStack-run builder) | GitHub Actions (customer repo) |
|---|---|---|---|
| Who runs the build | Cloudflare CI in the customer's account, from Cloudflare's own GitHub App connection | DevStack: Queue consumer starts an ephemeral container per job | GitHub runner in the customer's repo |
| Control over UX/logs | Low–medium: trigger + read builds via API, but repo must be connected through Cloudflare's GitHub App in the customer's dashboard | Full: we own phases, log streaming, timeouts, artifact handling | Medium: logs via Actions API; workflow lives in user's repo |
| Fit with existing code | Good for `cf-build` profiles already produced by "Prepare for Cloudflare" | Reuses `cloudflare.ts` direct upload for the *output* (assets / bundled Worker) into the customer account | **Conflicts**: `policy.ts` blocks writing `.github/workflows/*` (deliberate, prevents secret exfiltration) |
| Limits (approx.) | Build minutes/month and concurrency per CF plan (Free ≈ low concurrency; Paid higher); ~20 min build timeout | Instance size/vCPU/memory chosen by us; Workers Paid required; per-second billing | 2,000 free min/month private (Free plan), job timeout 6 h |
| Security | Isolation is Cloudflare's; secrets stay in customer account; no DevStack secret exposure | We must harden: no DevStack secrets in container, egress allowlist (registry + GitHub), short-lived GitHub installation token scoped to one repo, size/time caps, sanitize logs | Repo secrets reachable by workflow; needs workflow write permission (broad) |
| Cost to DevStack | ~0 (customer's quota) | Pay per build second + R2 artifacts → must be quota-gated (`takeQuota('build')`) | ~0 (customer's quota) |
| Provider-agnostic | No (Cloudflare only) | Yes — output can target Cloudflare now, Vercel later | Partly |

## Recommendation
1. **Primary executor (Milestone 2): Cloudflare Containers builder** behind a Queue (`build-jobs`), state in `build_jobs`/`build_events`, artifacts in a new R2 bucket, final upload through the existing Cloudflare provider into the *customer's* account with their sealed token. This is the only option that gives DevStack real build logs, preview/production control, retry and idempotency while keeping the provider abstraction.
2. **Secondary adapter: Workers Builds** (`executor='workers-builds'`) for customers who already connected their repo in Cloudflare — zero cost to us, read status/logs via API.
3. **Do not use GitHub Actions injection** as default (policy conflict + secret exposure). Revisit only as opt-in.
4. Keep `direct` path (no build) as the fast path — already working and tested.

Fallback if Containers is not approved: ship Milestones 1, 3 (direct-path previews) and 4 first, plus Workers Builds adapter; builds requiring install/build go through Workers Builds only.
