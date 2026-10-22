# devstack-bid

Command-line interface for [devstack.bid](https://devstack.bid). Sign in, create projects from templates, link a folder to a GitHub repo, deploy to `<slug>.devstack.bid` and watch build logs. [ภาษาไทย](./README.th.md)

## Install

```bash
npm i -g devstack-bid     # or: npx devstack-bid <command>
```

Requires Node.js 20 or newer. No runtime dependencies.

## Quick start

```bash
devstack login                   # opens devstack.bid/cli/device; type the code shown in your terminal
devstack link --repo you/my-site # import a GitHub repo (uses your GitHub connection on devstack.bid)
devstack deploy --prod           # build, stream logs, print https://<slug>.devstack.bid
```

## Commands

| Command | What it does |
| --- | --- |
| `login [--token] [--no-browser]` | Browser sign-in with a code, or `--token` to paste a key from devstack.bid/settings/cli (hidden input; reads stdin when piped: `echo "$KEY" \| devstack login --token`) |
| `logout` | Revokes this machine's key on the server and deletes local credentials |
| `whoami` | Shows the signed-in account and key scopes |
| `templates` | Lists starters (`static`, `worker`) and repo templates |
| `create <name> [--template <id>]` | Starter (default `static`): files in `./<name>`. Repo template: a new GitHub repo in your account |
| `init [--template static\|worker]` | Starter into the current empty folder (default `static`) |
| `link [--project <id\|name>] [--repo owner/name] [--branch b] [--root dir]` | Links this folder (`.devstack/project.json`); `--repo` imports the repo and starts a first build |
| `deploy [--prod] [--ref <ref>]` | Builds the linked GitHub repo (preview by default) and streams the log |
| `status` | Linked project and the last 10 deployments |
| `logs <deployment-id> [--follow]` | Build log for a deployment |

Exit codes: `0` success, `1` API error or failed build, `2` usage error (unknown option, missing value, not linked).

## Permissions

On the approval page you choose what the key may do. `cli:setup` (create projects, read status) is always granted; `cli:deploy` (import repos, start builds, read logs) is an opt-in checkbox. `deploy`, `link --repo` and `logs` need `cli:deploy`.

## Limits (v0.1.0)

Deploys build from GitHub. Uploading a local folder to `*.devstack.bid` is not supported by the server yet; the CLI reports this clearly.

## Security

- Keys are stored hashed on the server, rate-limited per key, expire 90 days after last use, and can be revoked at devstack.bid/settings/cli (which also shows last use and sign-in activity).
- Approve a sign-in only if you just ran `devstack login` yourself. The code is never in the link; you type it.
- Locally the key lives in `~/.config/devstack/auth.json` with mode `0600` (respects `XDG_CONFIG_HOME`), bound to the server it was issued for. If `DEVSTACK_API` points elsewhere, the saved key is not sent; only `DEVSTACK_TOKEN` is used, with a warning.
- The CLI never prints tokens and redacts token-shaped strings from logs.
- In CI set `DEVSTACK_TOKEN`. `DEVSTACK_API` must be `https://` (http only for localhost).

## License

MIT. Part of the devstack.bid project.
