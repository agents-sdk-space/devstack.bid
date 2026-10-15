# CLI setup (macOS arm64)

1. Sign in, open `/settings/cli`, click **Create key** (scope `cli:setup`, hashed at rest, shown once, 60 req/min, revocable).
2. In Terminal: `curl -fsSL https://devstack.bid/setup.sh | bash -s -- my-app` (add `worker` for a script Worker). The key is asked with hidden input, or read from `DEVSTACK_KEY`.
3. Result: `./my-app/` and `./my-app-deploy.zip`. Deploy with `cd my-app && npx wrangler deploy`, or upload on devstack.bid.

The same zip is available without Terminal from `/settings/cli` and, for an existing project, the **Download deploy zip** button on `/projects/:id`. All come from `buildDeployZip` in `src/lib/deploy/bundle.ts`.

API: `GET /setup.sh`, `GET /api/cli/whoami`, `POST /api/cli/scaffold {name, template}` (Bearer CLI key), `GET /api/cli/starter` and `GET /api/projects/:id/zip` (signed-in session).
Zips never contain `.env*`, `.dev.vars*`, `.npmrc`, `.git` or `node_modules`; `DEPLOY.txt` lists required env var names only.
Starters come from cloudflare/workers-sdk (MIT OR Apache-2.0), see `THIRD_PARTY_NOTICES.md`.
