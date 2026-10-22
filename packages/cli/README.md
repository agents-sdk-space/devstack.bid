# @lsuperdev/devstack

Command-line interface for [devstack.bid](https://devstack.bid). Sign in, create projects from templates, link a folder to a GitHub repo, deploy to `<slug>.devstack.bid` and watch build logs. [ภาษาไทย](./README.th.md)

```bash
npm i -g @lsuperdev/devstack     # or: npx @lsuperdev/devstack <command>
devstack login                   # opens the browser; confirm the code shown in the terminal
devstack link --repo you/my-site # import a GitHub repo (uses your GitHub connection on devstack.bid)
devstack deploy --prod           # build, stream logs, print https://<slug>.devstack.bid
```

| Command | What it does |
| --- | --- |
| `login [--token] [--no-browser]` | Device-code sign-in in the browser, or paste a key from devstack.bid/settings/cli (hidden input) |
| `logout` | Revokes this machine's key on the server and deletes local credentials |
| `whoami` | Shows the signed-in account and key scopes |
| `templates` | Lists starters (`static`, `worker`) and repo templates |
| `create <name> --template <id>` | Starter → files in `./<name>`; repo template → new GitHub repo in your account |
| `init [--template static\|worker]` | Starter into the current empty folder |
| `link [--project <id\|name>] [--repo owner/name] [--branch b] [--root dir]` | Links this folder (`.devstack/project.json`); `--repo` imports and starts a first build |
| `deploy [--prod] [--ref <ref>]` | Builds the linked GitHub repo (preview by default) and streams the log |
| `status` | Linked project and the last 10 deployments |
| `logs <deployment-id> [--follow]` | Build log for a deployment |

**Limits (v0.1.0).** Deploys build from GitHub. Uploading a local folder to `*.devstack.bid` hosting is not supported by the server yet; the CLI says so instead of pretending.

**Security.** Keys are stored hashed on the server, scoped to `cli:setup` + `cli:deploy`, rate-limited per key and revocable at devstack.bid/settings/cli. Locally they live in `~/.config/devstack/auth.json` with mode `0600` (respects `XDG_CONFIG_HOME`). The CLI never prints tokens and redacts token-shaped strings from logs. In CI set `DEVSTACK_TOKEN`. `DEVSTACK_API` must be `https://` (http only for localhost).

Requirements: Node.js 18+. No runtime dependencies.

License: MIT. Part of the devstack.bid project.
