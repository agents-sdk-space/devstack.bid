# Milestone 1: Project Creation (local only)

## What it adds
- `/new`, a New Project page with three ways to start. All of them call real APIs.
  - **Import Git**: `GET /api/github/repositories` (search and pagination), then `GET /api/github/inspect` (branches, candidate root directories, detected framework), then `POST /api/projects/import`.
  - **Upload files**: the existing `POST /api/projects/upload`. Zip uploads now also reject symlinks.
  - **Template**: the existing `POST /api/projects` with a `templateId`.
- `src/lib/projects/config.ts`: slug rules, framework detection (Next.js, Astro, SvelteKit, Nuxt, React Router, Remix, Vite, static, Worker, Node), root and output directory checks, and build command checks.
- `src/lib/projects/import.ts`: links an existing repository without making a copy. Its GitHub calls are read-only (repo metadata, branches, tree, package.json). It saves `projects` plus `project_connections` in one batch.
- Migrations `0013_projects_platform.sql` and `0014_project_env_webhooks.sql`. They are additive and have been applied only to the local D1 and in tests.
- Deploys of an imported project now upload only the files under its configured root directory.

## States in the import flow
Loading (skeleton), not connected or expired (Connect GitHub with `/api/auth/github?next=/new`), permission denied (steps to grant org access, plus Retry), empty list, error with Retry, and an inspect error with Retry.

## Not in this milestone
GitHub App installs and the org picker are blocked until the GitHub App is registered. Builds are Milestone 2. Folder upload and multi-file upload are not included yet; only zip upload works.
