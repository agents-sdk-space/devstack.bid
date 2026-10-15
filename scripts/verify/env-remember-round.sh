#!/usr/bin/env bash
# Local verification round: Secrets Store CREDENTIALS_KEY, Remember/Environment, one-off deploy token, R2 chat archive.
# Needs: next dev on $BASE (local D1 0001-0012, local Secrets Store CREDENTIALS_KEY), scripts/verify/mock-cloudflare.mjs on :18790.
# shellcheck disable=SC2016
set -u
ROUND="${1:?round number}"
BASE="${BASE:-http://127.0.0.1:3100}"
W="$(mktemp -d)"
J="$W/cookies"
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf 'PASS %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'FAIL %s\n' "$1"; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
api() { curl -sS -b "$J" -c "$J" -H "Origin: $BASE" "$@"; }
jget() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2],{"d":d}))' "$@" 2>/dev/null; }
d1() { npx wrangler d1 execute nvx-db --local --json --command "$1" 2>/dev/null; }

email="env${ROUND}-$(date +%s)@example.test"
pw="Verify-$(openssl rand -hex 8)-Aa1!"
loc=$(curl -sS -c "$J" -H "Origin: $BASE" -o /dev/null -w '%{http_code} %{redirect_url}' -X POST --data-urlencode "action=register" --data-urlencode "email=$email" --data-urlencode "password=$pw" "$BASE/api/auth/password")
check "register account" 'case "$loc" in "303 "*auth=*) false;; "303 "*) true;; *) false;; esac'

api -o "$W/env0.json" "$BASE/api/environment"
check "environment empty, encryption v2 (key from Secrets Store binding)" '[ "$(jget "$W/env0.json" "len(d[\"env\"])+len(d[\"connections\"])")" = 0 ] && [ "$(jget "$W/env0.json" "d[\"encryption\"]")" = v2 ]'

TOKEN="mocktoken$(openssl rand -hex 20)"
ACCT="$(openssl rand -hex 16)"
code=$(api -o "$W/c1.json" -w '%{http_code}' -X PUT -H 'Content-Type: application/json' --data "{\"token\":\"$TOKEN\",\"accountId\":\"$ACCT\"}" "$BASE/api/connections/cloudflare")
check "connections PUT, Remember off: verified, remembered=false" '[ "$code" = 200 ] && [ "$(jget "$W/c1.json" "d[\"remembered\"]")" = False ]'
api -o "$W/env1.json" "$BASE/api/environment"
check "Remember off persisted nothing" '[ "$(jget "$W/env1.json" "len(d[\"env\"])+len(d[\"connections\"])")" = 0 ]'

mkdir -p "$W/s/site-r$ROUND"; printf '<h1>r%s</h1>\n' "$ROUND" > "$W/s/site-r$ROUND/index.html"
python3 -c 'import os,sys,zipfile
with zipfile.ZipFile(sys.argv[1],"w") as z:
    z.write(sys.argv[2]+"/index.html", os.path.basename(sys.argv[2])+"/index.html")' "$W/site.zip" "$W/s/site-r$ROUND"
api -o "$W/up.json" -X POST -F "file=@$W/site.zip;type=application/zip" "$BASE/api/projects/upload"
PID=$(jget "$W/up.json" 'd["project"]["id"]')
check "upload zip creates project" '[ -n "$PID" ]'

wait_deploy() {
  local i st
  for i in $(seq 1 30); do
    api "$BASE/api/projects/$1/deploy" > "$W/deps.json"
    st=$(jget "$W/deps.json" 'd["deployments"][0]["status"]')
    case "$st" in live|failed) printf '%s' "$st"; return;; esac
    sleep 1
  done
  printf 'timeout'
}
code=$(api -o "$W/d0.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' "$BASE/api/projects/$PID/deploy")
check "deploy without any token -> 401 reauth" '[ "$code" = 401 ]'

code=$(api -o "$W/d1.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data "{\"token\":\"$TOKEN\",\"accountId\":\"$ACCT\"}" "$BASE/api/projects/$PID/deploy")
st=$(wait_deploy "$PID")
check "one-off token deploy (Remember off) goes live" '[ "$code" = 202 ] && [ "$st" = live ]'
api -o "$W/env2.json" "$BASE/api/environment"
check "one-off token not persisted" '[ "$(jget "$W/env2.json" "len(d[\"env\"])+len(d[\"connections\"])")" = 0 ] && ! grep -q "$TOKEN" "$W/deps.json"'

api -o /dev/null -X POST -H 'Content-Type: application/json' --data "{\"name\":\"CLOUDFLARE_API_TOKEN\",\"value\":\"$TOKEN\",\"provider\":\"cloudflare\"}" "$BASE/api/environment"
api -o /dev/null -X POST -H 'Content-Type: application/json' --data "{\"name\":\"CLOUDFLARE_ACCOUNT_ID\",\"value\":\"$ACCT\"}" "$BASE/api/environment"
code=$(api -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{"name":"bad name","value":"x"}' "$BASE/api/environment")
check "invalid env name rejected" '[ "$code" = 400 ]'
api -o "$W/env3.json" "$BASE/api/environment"
check "Environment lists names + dates, never values" '[ "$(jget "$W/env3.json" "sorted(e[\"name\"] for e in d[\"env\"])")" = "[%sCLOUDFLARE_ACCOUNT_ID%s, %sCLOUDFLARE_API_TOKEN%s]" ] 2>/dev/null || [ "$(jget "$W/env3.json" "\",\".join(sorted(e[\"name\"] for e in d[\"env\"]))")" = "CLOUDFLARE_ACCOUNT_ID,CLOUDFLARE_API_TOKEN" ] && ! grep -q "$TOKEN" "$W/env3.json" && ! grep -q "$ACCT" "$W/env3.json" && ! grep -q "secret_enc\|v2\." "$W/env3.json"'

sleep 1
api -o /dev/null -X POST -H 'Content-Type: application/json' --data '{}' "$BASE/api/projects/$PID/deploy"
st=$(wait_deploy "$PID")
api -o "$W/env4.json" "$BASE/api/environment"
check "deploy uses remembered Environment token; lastUsedAt stamped" '[ "$st" = live ] && [ "$(jget "$W/env4.json" "all(e[\"lastUsedAt\"] for e in d[\"env\"])")" = True ]'

UID_=$(d1 "SELECT user_id FROM user_env WHERE name='CLOUDFLARE_API_TOKEN' ORDER BY created_at DESC LIMIT 1" | jget /dev/stdin 'd[0]["results"][0]["user_id"]')
d1 "SELECT secret_enc FROM user_env WHERE user_id='$UID_'" > "$W/rows.json"
check "D1 rows are v2 ciphertext, no plaintext" 'grep -q "\"v2\." "$W/rows.json" && ! grep -q "$TOKEN" "$W/rows.json" && ! grep -q "$ACCT" "$W/rows.json"'

code=$(api -o "$W/c2.json" -w '%{http_code}' -X PUT -H 'Content-Type: application/json' --data "{\"token\":\"$TOKEN\",\"accountId\":\"$ACCT\",\"remember\":true}" "$BASE/api/connections/cloudflare")
api -o "$W/env5.json" "$BASE/api/environment"
check "Remember on (connections) saves; shows as connection" '[ "$code" = 200 ] && [ "$(jget "$W/env5.json" "[c[\"kind\"] for c in d[\"connections\"]]")" = "[%s]" ] 2>/dev/null || [ "$(jget "$W/env5.json" "\",\".join(c[\"kind\"] for c in d[\"connections\"])")" = cloudflare ]'

api -o /dev/null -X DELETE "$BASE/api/environment/CLOUDFLARE_API_TOKEN"
api -o /dev/null -X DELETE "$BASE/api/environment/CLOUDFLARE_ACCOUNT_ID"
api -o /dev/null -X DELETE "$BASE/api/connections/cloudflare"
api -o "$W/env6.json" "$BASE/api/environment"
check "delete removes entries and connection" '[ "$(jget "$W/env6.json" "len(d[\"env\"])+len(d[\"connections\"])")" = 0 ]'

code=$(curl -sS -o /dev/null -w '%{http_code}' -H "Origin: https://evil.example" -X POST -H 'Content-Type: application/json' -b "$J" --data '{"name":"X_TOKEN","value":"y"}' "$BASE/api/environment")
check "cross-site POST blocked" '[ "$code" = 403 ]'
code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/environment")
check "anonymous GET 401" '[ "$code" = 401 ]'

api -o "$W/turn.txt" -X POST -H 'Content-Type: application/json' --data "{\"message\":\"hello round $ROUND\",\"mode\":\"general\"}" "$BASE/api/chat/turn"
CID=$(sed -n 's/.*"t":"meta","conversationId":"\([^"]*\)","messageId":"\([^"]*\)".*/\1/p' "$W/turn.txt" | head -1)
MID=$(sed -n 's/.*"t":"meta","conversationId":"\([^"]*\)","messageId":"\([^"]*\)".*/\2/p' "$W/turn.txt" | head -1)
UID2=$(d1 "SELECT user_id FROM conversations WHERE id='$CID'" | jget /dev/stdin 'd[0]["results"][0]["user_id"]')
sleep 2
npx wrangler r2 object get "nvx-chat-streams/chat/$UID2/$CID/$MID.json" --local --pipe > "$W/arch.json" 2>/dev/null
MSGS=$(d1 "SELECT COUNT(*) AS n FROM messages WHERE conversation_id='$CID'" | jget /dev/stdin 'd[0]["results"][0]["n"]')
check "chat turn archived to R2 (meta first), D1 messages intact" '[ -n "$CID" ] && [ "$(jget "$W/arch.json" "d[\"events\"][0][\"t\"]")" = meta ] && [ "$MSGS" = 2 ]'
printf 'events: %s\n' "$(jget "$W/arch.json" '[e["t"] for e in d["events"]]')"

printf '\nround %s: %s passed, %s failed\n' "$ROUND" "$PASS" "$FAIL"
[ "$FAIL" = 0 ] && rm -rf "$W" || printf "kept %s\n" "$W"
[ "$FAIL" = 0 ]
