#!/usr/bin/env bash
# Local verification round for CLI setup + deploy zip (needs: next dev on $BASE, scripts/verify/mock-cloudflare.mjs on :18790).
# shellcheck disable=SC2016,SC2034
set -u
ROUND="${1:?round number}"
BASE="${BASE:-http://127.0.0.1:3100}"
MOCK="${MOCK:-http://127.0.0.1:18790}"
W="$(mktemp -d)"
J="$W/cookies"
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf 'PASS %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'FAIL %s\n' "$1"; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
api() { curl -sS -b "$J" -c "$J" -H "Origin: $BASE" "$@"; }

email="round${ROUND}-$(date +%s)@example.test"
pw="Verify-$(openssl rand -hex 8)-Aa1!"
loc=$(curl -sS -c "$J" -H "Origin: $BASE" -o /dev/null -w '%{http_code} %{redirect_url}' -X POST --data-urlencode "action=register" --data-urlencode "email=$email" --data-urlencode "password=$pw" "$BASE/api/auth/password")
check "register account (303, no auth error)" 'case "$loc" in "303 "*auth=*) false;; "303 "*) true;; *) false;; esac'

api -X POST -H 'Content-Type: application/json' --data '{"name":"CLI verify","scopes":["cli:setup"]}' "$BASE/api/mcp/keys" > "$W/key.json"
KEY=$(sed -n 's/.*"key":"\([^"]*\)".*/\1/p' "$W/key.json")
KID=$(sed -n 's/.*"client":{"id":"\([^"]*\)".*/\1/p' "$W/key.json")
check "create CLI key" '[ -n "$KEY" ] && [ -n "$KID" ]'

APP="app-r${ROUND}"
( cd "$W" && curl -fsSL "$BASE/setup.sh" | DEVSTACK_KEY="$KEY" DEVSTACK_API="$BASE" bash -s -- "$APP" ) > "$W/setup.out" 2>&1
rc=$?
check "setup.sh exit 0" '[ $rc = 0 ]'
check "setup.sh never prints the key" '! grep -q "$KEY" "$W/setup.out"'
check "folder + zip exist" '[ -f "$W/$APP/index.html" ] && [ -f "$W/$APP-deploy.zip" ]'
check "zip has wrangler/package/DEPLOY/NOTICE" 'unzip -l "$W/$APP-deploy.zip" | grep -q "$APP/wrangler.jsonc" && unzip -l "$W/$APP-deploy.zip" | grep -q "$APP/DEPLOY.txt" && unzip -l "$W/$APP-deploy.zip" | grep -q "$APP/NOTICE"'
( cd "$W/$APP" && npx --yes wrangler@4 deploy --dry-run > "$W/dry.out" 2>&1 ); rc=$?
check "wrangler deploy --dry-run" '[ $rc = 0 ]'

TOKEN="mocktoken$(printf 'x%.0s' $(seq 1 40))"
ACCT="$(openssl rand -hex 16)"
code=$(api -o "$W/conn.json" -w '%{http_code}' -X PUT -H 'Content-Type: application/json' --data "{\"token\":\"$TOKEN\",\"accountId\":\"$ACCT\"}" "$BASE/api/connections/cloudflare")
check "connect mocked Cloudflare" '[ "$code" = 200 ]'

api -o "$W/up.json" -X POST -F "file=@$W/$APP-deploy.zip;type=application/zip" "$BASE/api/projects/upload"
PID=$(sed -n 's/.*"project":{"id":"\([^"]*\)".*/\1/p' "$W/up.json")
check "upload zip creates project" '[ -n "$PID" ] && grep -q "\"profile\":\"chat-static\"" "$W/up.json"'

wait_deploy() {
  local i st
  for i in $(seq 1 30); do
    api "$BASE/api/projects/$1/deploy" > "$W/deps.json"
    st=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1]))["deployments"]; print(d[0]["status"] if d else "")' "$W/deps.json" 2>/dev/null)
    case "$st" in live|failed) printf '%s' "$st"; return;; esac
    sleep 1
  done
  printf 'timeout'
}
api -o "$W/dep.json" -X POST -H 'Content-Type: application/json' --data '{}' "$BASE/api/projects/$PID/deploy"
st=$(wait_deploy "$PID")
check "deploy live via mocked Cloudflare" '[ "$st" = live ] && grep -q "workers.dev" "$W/deps.json"'

FAILAPP="fail-r${ROUND}"
zipdir() { python3 -c 'import os,sys,zipfile
out,root=sys.argv[1],sys.argv[2]
with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
    for d,_,fs in os.walk(root):
        for f in fs: p=os.path.join(d,f); z.write(p,os.path.relpath(p,os.path.dirname(root)))' "$1" "$2"; }
mkdir -p "$W/f/$FAILAPP/src"
printf 'export default { fetch() { return new Response("broken"); } };\n' > "$W/f/$FAILAPP/src/index.js"
printf '{"name":"%s","main":"./src/index.js","compatibility_date":"2026-10-01"}\n' "$FAILAPP" > "$W/f/$FAILAPP/wrangler.jsonc"
zipdir "$W/fail.zip" "$W/f/$FAILAPP"
api -o "$W/up2.json" -X POST -F "file=@$W/fail.zip;type=application/zip" "$BASE/api/projects/upload"
FID=$(sed -n 's/.*"project":{"id":"\([^"]*\)".*/\1/p' "$W/up2.json")
api -o /dev/null -X POST -H 'Content-Type: application/json' --data '{}' "$BASE/api/projects/$FID/deploy"
st=$(wait_deploy "$FID")
check "failing deploy recorded as failed with sanitized log" '[ "$st" = failed ] && ! grep -q "$TOKEN" "$W/deps.json"'
printf '// FIXED\nexport default { fetch() { return new Response("ok"); } };\n' > "$W/f/$FAILAPP/src/index.js"
rm -f "$W/fail.zip"; zipdir "$W/fail.zip" "$W/f/$FAILAPP"
api -o "$W/up3.json" -X POST -F "file=@$W/fail.zip;type=application/zip" -F "projectId=$FID" "$BASE/api/projects/upload"
api -o /dev/null -X POST -H 'Content-Type: application/json' --data '{}' "$BASE/api/projects/$FID/deploy"
st=$(wait_deploy "$FID")
check "fixed zip + retry deploy goes live" '[ "$st" = live ]'

printf 'API_KEY=sk-proj-%s\n' "$(printf 'a%.0s' $(seq 1 40))" > "$W/f/$FAILAPP/config.txt"
rm -f "$W/bad.zip"; zipdir "$W/bad.zip" "$W/f/$FAILAPP"
code=$(api -o "$W/up4.json" -w '%{http_code}' -X POST -F "file=@$W/bad.zip;type=application/zip" "$BASE/api/projects/upload")
check "secret-looking content rejected (422)" '[ "$code" = 422 ] && grep -q secret_content "$W/up4.json"'

api -o "$W/proj.zip" "$BASE/api/projects/$PID/zip"
check "download zip from /projects" 'unzip -l "$W/proj.zip" | grep -q "index.html"'
api -o "$W/studio.zip" -X POST -H 'Content-Type: application/json' --data '{"name":"studio-r'"$ROUND"'","templateId":"studio","files":[{"path":"package.json","content":"{\"name\":\"s\",\"scripts\":{\"build\":\"vite build\"}}"},{"path":"index.html","content":"<div id=root></div>"},{"path":"src/main.tsx","content":"export {}"},{"path":".env","content":"SECRET=1"}]}' "$BASE/api/projects/bundle"
check "Studio deploy zip (assets ./dist, no .env)" 'unzip -p "$W/studio.zip" "studio-r'"$ROUND"'/wrangler.jsonc" | grep -q "./dist" && ! unzip -l "$W/studio.zip" | grep -q "\.env"'
api -o "$W/chat.zip" -X POST -H 'Content-Type: application/json' --data '{"name":"chat-app","files":[{"path":"index.html","content":"<h1>chat</h1>"}]}' "$BASE/api/projects/bundle"
check "chat-result deploy zip" 'unzip -l "$W/chat.zip" | grep -q "chat-app/index.html"'

code=$(api -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/mcp/keys/$KID")
check "revoke key" '[ "$code" = 200 ]'
code=$(printf 'header = "Authorization: Bearer %s"\n' "$KEY" | curl -sS -K - -o /dev/null -w '%{http_code}' "$BASE/api/cli/whoami")
check "revoked key rejected (401)" '[ "$code" = 401 ]'
( cd "$W" && curl -fsSL "$BASE/setup.sh" | DEVSTACK_KEY="$KEY" DEVSTACK_API="$BASE" bash -s -- "after-revoke" ) > "$W/setup2.out" 2>&1
rc=$?
check "setup.sh exits non-zero after revoke" '[ $rc != 0 ] && grep -q "Invalid or revoked" "$W/setup2.out"'

printf 'ROUND %s: %s passed, %s failed (workdir %s)\n' "$ROUND" "$PASS" "$FAIL" "$W"
[ "$FAIL" = 0 ]
