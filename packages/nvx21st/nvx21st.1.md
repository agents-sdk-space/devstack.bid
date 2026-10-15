# NAME

nvx21st - create, extend, pack and deploy devstack.bid templates from the terminal

# SYNOPSIS

```
nvx21st list
nvx21st new <name> [-t static|worker]
nvx21st add <user>/<slug> [--print]
nvx21st add @<registry> [--print]
nvx21st theme <id|url|file.css> [--into <file.css>] [--print]
nvx21st logo <query> [--save <dir>] [--pick <n>] [--dark] [--wordmark] [--json]
nvx21st search <query> [--type component|theme|template]
nvx21st publish <file> [-- <21st publish flags>]
nvx21st registry [@ns] [--user <u>] [--library <slug>]
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

**theme** *id* | *https-url* | *file.css*
: Read a theme's `:root` and `.dark` custom properties and write them between
  `/* nvx21st theme:start */` and `/* nvx21st theme:end */` markers in the
  project CSS (the first of `app/globals.css`, `src/app/globals.css`,
  `src/index.css`, `src/styles.css`, `styles.css`, `style.css`, else `theme.css`).
  Running it again replaces the block. A 21st theme id is fetched with the
  official `@21st-dev/cli theme` and needs `API_KEY_21ST`, which is never printed.
  A URL or local file needs no key. `--print` writes nothing.

**logo** *query*
: Search the free SVG logo library that 21st uses (svgl, `api.svgl.app`, no
  login) and list up to 10 matches. `--save` *dir* downloads one (`--pick` *n*;
  default is the exact title match, else the first; `--dark`, `--wordmark` for variants) after checking that it is a
  plain SVG with no scripts. Follow each brand's own usage guidelines.

**search** *query*, **publish** *file*
: Run the official 21st CLI (`npx @21st-dev/cli`, MIT) for these, so behaviour
  matches 21st exactly. Sign in with `npx @21st-dev/cli login` or export
  `API_KEY_21ST`. Pass extra publish flags after `--`, for example
  `nvx21st publish button.tsx -- --to button --visibility private`.

**registry** [*@ns*]
: Add a shadcn registry entry to `components.json` (created if missing):
  `"@ns": {"url": "https://21st.dev/r/<user>/<library>/{name}.json",
  "headers": {"Authorization": "Bearer ${API_KEY_21ST}"}}`. Only the variable
  reference is written, never a key. Defaults: `@nvx21st`, `--user thanabartbb`,
  `--library default`. Then `npx shadcn@latest add @ns/<name>`.

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

`--into` *file.css*
: **theme**: target CSS file.

`--save` *dir* / `-n`, `--pick` *n* / `--dark` / `--wordmark` / `--json`
: **logo** options.

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
: Optional 21st.dev key for **add** and **theme** *id*.

`DEVSTACK_API`
: Same as `--api`.

# EXAMPLES

```
nvx21st list
export DEVSTACK_KEY=nvx_live_...      # hidden: read -rs DEVSTACK_KEY && export DEVSTACK_KEY
nvx21st new my-app -t worker
cd my-app
nvx21st add shadcnui-blocks/process-timeline --print
nvx21st theme https://example.com/theme.css --print
nvx21st theme ./my-theme.css
nvx21st logo cloudflare
nvx21st logo github --save public/logos --dark
nvx21st search "pricing table"
nvx21st registry @devstack --library design-system
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
(https://help.21st.dev/cli, https://help.21st.dev/cli/reference). Logos come
from svgl (https://svgl.app, MIT). Both are used as reference only and no code was copied.
