# NAME

nvx21st - create, extend, pack and deploy devstack.bid templates from the terminal

# SYNOPSIS

```
nvx21st list
nvx21st new <name> [-t static|worker]
nvx21st add <user>/<slug> [--print]
nvx21st add @<registry> [--print]
nvx21st zip [dir] [-o <file>] [--force]
nvx21st deploy [dir] [--dry-run]
nvx21st whoami
nvx21st help | man | --version
```

# DESCRIPTION

**nvx21st** is the command-line companion to devstack.bid templates. It creates a
project from a devstack.bid starter, adds UI components from the 21st.dev
community registry through shadcn, packs a folder into a deploy-ready zip, and
deploys it to Cloudflare with your own wrangler login.

It has no dependencies beyond Node.js 20+ and never stores credentials. Keys are
read from environment variables for a single run. Templates ship Cloudflare's
public Turnstile test keys only, so a generated project is safe to share.

# COMMANDS

**list**
: Show the starter templates: `static` (Workers Assets site) and `worker`
  (Worker with a fetch handler).

**new** *name* (alias **init**)
: Ask devstack.bid for a deploy-ready zip of the template, save it as
  *name*-deploy.zip and unpack it into ./*name*. Needs `DEVSTACK_KEY`.

**add** *user*/*slug* | @*registry*
: Run `npx shadcn@latest add` against `https://21st.dev/r/<user>/<slug>`. When
  `API_KEY_21ST` is set it is appended to the URL but never printed.
  `--print` shows the command without running it.

**zip** [*dir*]
: Pack *dir* (default `.`) into *dir*-deploy.zip next to the folder (so it is never deployed as an asset). `.env*`, `.dev.vars*`, `.git`,
  `node_modules`, `.wrangler`, `.npmrc` and `.next` are always left out. Refuses
  if a file looks like it holds a live key (Cloudflare test keys are allowed).

**deploy** [*dir*]
: Run `npx wrangler@4 deploy` in *dir* using your own `wrangler login` (needs Node.js 22+).
  `--dry-run` builds without uploading.

**whoami**
: Show the devstack.bid account that `DEVSTACK_KEY` belongs to.

# OPTIONS

`-t`, `--template` *static|worker*
: Template for **new** (default `static`).

`-o`, `--out` *file*
: Output path for **zip**.

`--force`
: **zip** even when the secret check matches.

`--print`
: **add**: print the shadcn command only.

`--dry-run`
: **deploy**: pass `--dry-run` to wrangler.

`--api` *url*
: devstack.bid base URL (default `https://devstack.bid`, or `DEVSTACK_API`).

`-h`, `--help` / `-v`, `--version`
: Help and version.

# ENVIRONMENT

`DEVSTACK_KEY`
: CLI key (`nvx_live_…`) from https://devstack.bid/settings/cli. Used for **new** and **whoami**.

`API_KEY_21ST`
: Optional 21st.dev key for **add**.

`DEVSTACK_API`
: Same as `--api`.

# EXAMPLES

```
nvx21st list
export DEVSTACK_KEY=nvx_live_...      # hidden: read -rs DEVSTACK_KEY && export DEVSTACK_KEY
nvx21st new my-app -t worker
cd my-app
nvx21st add shadcnui-blocks/process-timeline --print
nvx21st zip . -o ../my-app-deploy.zip
nvx21st deploy --dry-run
nvx21st deploy
```

# EXIT STATUS

0 on success, 1 on any error (the message is printed to stderr).

# SEE ALSO

`curl -fsSL https://devstack.bid/setup.sh | bash -s -- my-app` (the same
starter in a single command, no Node needed), wrangler(1), shadcn.

# CREDITS

The command layout takes ideas from the public 21st CLI documentation
(https://help.21st.dev/cli). It is used as reference only and no code was copied.
