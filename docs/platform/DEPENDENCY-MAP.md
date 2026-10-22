# Dependency Map

```mermaid
flowchart LR
  subgraph UI["Next.js App Router (existing)"]
    NP["/new (IMPLEMENT)"] --> PJ["/projects, /projects/[id] (EXTEND)"]
    SC["/settings/connections (REUSE)"]
  end
  subgraph API["Route handlers (gate(): session + same-origin + burst)"]
    AP["/api/projects (EXTEND: import mode)"]
    AI["/api/projects/import (IMPLEMENT)"]
    AU["/api/projects/upload (REUSE)"]
    AD["/api/projects/:id/deploy (EXTEND)"]
    ADP["/api/deployments/:id (+/logs) (EXTEND)"]
    AW["/api/webhooks/github (IMPLEMENT)"]
    AR["/api/github/repos (EXTEND: search/pages/installs)"]
  end
  subgraph LIB["src/lib"]
    AUTH["auth/session + token-box (REUSE)"]
    GH["auth/github-api (EXTEND) + github-app (IMPLEMENT)"]
    PS["connections/projects (EXTEND)"]
    DS["deploy/service (EXTEND → job orchestrator)"]
    FD["deploy/templates detect (EXTEND)"]
    PR["deploy/providers registry (REUSE)"]
    CF["deploy/cloudflare direct (REUSE)"]
    CB["deploy/cloudflare-build executor (IMPLEMENT, BLOCKED infra)"]
    VC["deploy/vercel stub (later)"]
    SAN["deploy/sanitize (REUSE)"]
  end
  subgraph CFI["Cloudflare bindings"]
    D1[("D1 nvx-db")]
    R2[("R2 build artifacts/logs (NEW, approval)")]
    Q[["Queue build-jobs (NEW, approval)"]]
    CT[["Containers builder (NEW, approval)"]]
    SS["Secrets Store CREDENTIALS_KEY (REUSE)"]
  end
  NP --> AI & AU & AP
  PJ --> AD & ADP
  AI --> GH & PS
  AR --> GH
  AW --> GH --> PS
  AD --> DS --> PR --> CF & CB & VC
  DS --> Q --> CB --> CT
  CB --> R2
  DS --> SAN
  PS & DS --> D1
  AUTH --> SS
  API --> AUTH
```

Build order follows the edges: D1 migration → project/import services → New Project UI → job state machine + queue → executor → preview URLs → webhooks.

## Critical path (text form)

1. **D1 migrations 0013–0016** (local only) — every later piece reads or writes these tables. They only add tables and columns, so the current `projects`, `deployments` and `audit_events` readers keep working.
2. **Project service extension** (`connections/projects.ts`) — slug, source, root directory and build settings, with every query still scoped by `user_id`.
3. **Import API** (`/api/projects/import`) — uses the existing OAuth token today and switches to GitHub App installation tokens once the owner registers the App.
4. **New Project UI** (`/new`) — calls only real APIs: import, upload and template create.
5. **Build orchestrator** (`deploy/service.ts` → job state machine) plus a Queue consumer. It needs the Queue, Containers and R2 bindings approved first.
6. **Preview/production environments** and **rollback**, which use Worker versions in the customer's account.
7. **Webhooks** (push / PR) with delivery-id idempotency. These need the GitHub App webhook secret.

Items 1–4 have no infrastructure blocker. Items 5–7 are blocked until the owner approves the items in CREDENTIALS-NEEDED.md.
