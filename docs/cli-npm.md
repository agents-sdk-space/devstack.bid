# devstack CLI (npm package `@lsuperdev/devstack`)

Source: `packages/cli` (TypeScript → ESM, Node ≥ 18, no runtime deps, bin `devstack`, MIT, SemVer 0.1.0).

## Server endpoints added
| Endpoint | Auth | Notes |
| --- | --- | --- |
| `POST /api/cli/device` | none | Starts device sign-in. 10-min expiry, 5/min per IP. Device code stored as SHA-256 hash only (`cli_device_codes`, migration 0016). |
| `POST /api/cli/device/token` | device code | Poll. `428 pending`, `429 slow_down`, `410 expired`, `403 denied`. On approval mints one `api_clients` key (hashed, scopes `cli:setup`+`cli:deploy`, 60 req/min), row deleted (single use). Max 20 active keys. |
| `POST /api/cli/device/approve` | cookie + same-origin | Page `/cli/device?code=XXXX-XXXX`; user must press Approve/Deny. |
| `POST /api/cli/logout` | Bearer | Revokes the calling key. |
| `GET /api/cli/templates` | none | Starters + repo templates. |
| `GET /api/cli/whoami` | Bearer | Now accepts `cli:deploy` or `cli:setup`; returns scopes. |

Existing routes that now also accept a Bearer key with `cli:deploy` (opt-in `gate(..., { bearer: true })`):
`GET/POST /api/projects`, `POST /api/projects/import`, `POST /api/projects/:id/builds`, `GET /api/projects/:id/deploy`,
`GET /api/deployments/:id`, `GET /api/deployments/:id/logs`. The direct-deploy POST (takes Cloudflare tokens), connections,
upload and all other routes stay cookie-only. Settings → CLI keys are now created with both CLI scopes.

## Publish plan (not active — needs owner approval and `NPM_TOKEN`)
Add `.github/workflows/cli-publish.yml` after GO:

```yaml
name: Publish CLI
on:
  push:
    tags: ["cli-v*"]
permissions:
  contents: read
  id-token: write   # npm provenance
jobs:
  publish:
    runs-on: ubuntu-latest
    environment: npm   # require manual approval in repo settings
    defaults: { run: { working-directory: packages/cli } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, registry-url: "https://registry.npmjs.org" }
      - run: npm install --no-save typescript@5 @types/node@22
      - run: npm test
      - run: npm publish --provenance --access public
        env: { NODE_AUTH_TOKEN: "${{ secrets.NPM_TOKEN }}" }
```

Owner must: use npm account `lsuperdev` (2FA on), create a **granular automation token** limited to `@lsuperdev/devstack`
(publish only), add it as repo secret `NPM_TOKEN` in an `npm` environment with required reviewers. Then tag `cli-v0.1.0`.
