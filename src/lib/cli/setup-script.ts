/** The macOS arm64 setup script served at GET /setup.sh. Single source of truth (tests run bash -n / shellcheck on it). */
export function setupScript(origin = "https://devstack.bid"): string {
  return `#!/usr/bin/env bash
# DevStack setup: signs in with your devstack.bid CLI key and creates a new project as a deploy-ready zip.
# Usage: curl -fsSL ${origin}/setup.sh | bash -s -- my-app [static|worker]
set -eu

API="\${DEVSTACK_API:-${origin}}"
NAME="\${1:-}"
TEMPLATE="\${2:-static}"

die() { printf 'devstack: %s\\n' "$1" >&2; exit 1; }
has_tty() { ( : </dev/tty ) 2>/dev/null; }

case "$(uname -sm)" in
  "Darwin arm64") ;;
  *) printf 'devstack: warning: built for macOS arm64, detected %s; continuing.\\n' "$(uname -sm)" >&2 ;;
esac
for bin in curl unzip; do command -v "$bin" >/dev/null 2>&1 || die "missing $bin"; done

if [ -z "$NAME" ]; then
  has_tty || die "project name required: bash -s -- my-app"
  printf 'Project name: ' >/dev/tty
  read -r NAME </dev/tty
fi
NAME="$(printf '%s' "$NAME" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | sed 's/^-*//; s/-*$//' | cut -c1-63)"
[ -n "$NAME" ] || die "invalid project name"
case "$TEMPLATE" in static|worker) ;; *) die "template must be static or worker" ;; esac
[ ! -e "$NAME" ] || die "./$NAME already exists"
[ ! -e "$NAME-deploy.zip" ] || die "./$NAME-deploy.zip already exists"

KEY="\${DEVSTACK_KEY:-}"
unset DEVSTACK_KEY
if [ -z "$KEY" ]; then
  has_tty || die "set DEVSTACK_KEY (create one at ${origin}/settings/cli)"
  printf 'DevStack CLI key (hidden): ' >/dev/tty
  stty -echo </dev/tty
  read -r KEY </dev/tty || true
  stty echo </dev/tty
  printf '\\n' >/dev/tty
fi
case "$KEY" in nvx_live_*) ;; *) die "key must start with nvx_live_ (create one at ${origin}/settings/cli)" ;; esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

call() {
  printf 'header = "Authorization: Bearer %s"\\n' "$KEY" | curl -sS -K - -o "$TMP/out" -w '%{http_code}' "$@" || printf '000'
}
fail() {
  msg="$(sed -n 's/.*"error":"\\([^"]*\\)".*/\\1/p' "$TMP/out" 2>/dev/null | head -n 1)"
  die "\${msg:-request failed (HTTP $1)}"
}

printf '→ Signing in to %s\\n' "$API"
code="$(call "$API/api/cli/whoami")"
[ "$code" = 200 ] || fail "$code"
login="$(sed -n 's/.*"login":"\\([^"]*\\)".*/\\1/p' "$TMP/out")"
printf '  signed in%s\\n' "\${login:+ as $login}"

printf '→ Creating %s (%s)\\n' "$NAME" "$TEMPLATE"
code="$(call -X POST -H 'Content-Type: application/json' --data "{\\"name\\":\\"$NAME\\",\\"template\\":\\"$TEMPLATE\\"}" "$API/api/cli/scaffold")"
[ "$code" = 200 ] || fail "$code"
KEY=""

mv "$TMP/out" "$NAME-deploy.zip"
unzip -q "$NAME-deploy.zip" -d . || die "could not unzip"

printf '\\n✓ Project folder: %s/%s\\n' "$(pwd)" "$NAME"
printf '✓ Deploy zip:     %s/%s-deploy.zip\\n' "$(pwd)" "$NAME"
printf '\\nNext: open ${origin}/projects, choose "Deploy from a zip" and upload %s-deploy.zip\\n      (or run: cd %s && npx wrangler deploy)\\n' "$NAME" "$NAME"
`;
}
