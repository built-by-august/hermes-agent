#!/usr/bin/env bash
# Full local dev stack validation for the Custom Hermes Agent monorepo.
# Starts the API (production build) + frontend (vite dev), checks health,
# exercises auth + DB-backed endpoints, then stops both. Self-contained.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"
API_PORT=4000
WEB_PORT=5173
API_PID=""; WEB_PID=""
PASS=0; FAIL=0

log()  { printf '%s\n' "$*"; }
ok()   { printf '  [PASS] %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  [FAIL] %s\n' "$*"; FAIL=$((FAIL+1)); }

cleanup() {
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT

export PORT=$API_PORT HOST=127.0.0.1
( cd "$API_DIR" && node dist/server.js >/tmp/stack-api.log 2>&1 ) &
API_PID=$!

# Start web on an explicit free port; if 5173 busy vite auto-increments so
# detect the real port from the log.
( cd "$WEB_DIR" && pnpm dev >/tmp/stack-web.log 2>&1 ) &
WEB_PID=$!

# Wait for API
for i in $(seq 1 30); do
  curl -sf "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1 && break
  sleep 1
done

# Wait for web (detect actual port)
WEB_UP=""
for i in $(seq 1 30); do
  p=$(grep -oE 'Local:.*http://localhost:[0-9]+' /tmp/stack-web.log 2>/dev/null | grep -oE '[0-9]+$' | head -1)
  if [ -n "$p" ] && curl -sf "http://localhost:$p/" >/dev/null 2>&1; then WEB_UP="$p"; break; fi
  sleep 1
done

B="http://127.0.0.1:$API_PORT/api/v1"
log "== Backend =="
if curl -sf "http://127.0.0.1:$API_PORT/health" | grep -q '"ok"'; then ok "/health returns ok"; else bad "/health"; fi
[ "$(curl -s -o /dev/null -w '%{http_code}' "$B/docs/json")" = "200" ] && ok "OpenAPI JSON (200)" || bad "OpenAPI JSON"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$B/docs/")" = "200" ] && ok "Swagger UI (200)" || bad "Swagger UI"

log "== Auth (register -> login -> refresh -> me) =="
REG=$(curl -s -X POST "$B/auth/register" -H 'content-type: application/json' \
  -d '{"email":"stackcheck@example.com","password":"Str0ng!Pass","name":"Stack Check"}')
AT=$(printf '%s' "$REG" | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
[ -n "$AT" ] && ok "register returns access token" || bad "register token"
ME=$(curl -s "$B/auth/me" -H "authorization: Bearer $AT")
echo "$ME" | grep -q "stackcheck@example.com" && ok "/me returns authenticated user" || bad "/me"
RT=$(printf '%s' "$REG" | python3 -c "import sys,json;print(json.load(sys.stdin).get('refreshToken',''))" 2>/dev/null)
RR=$(curl -s -X POST "$B/auth/refresh" -H 'content-type: application/json' -d "{\"refreshToken\":\"$RT\"}")
printf '%s' "$RR" | grep -q '"accessToken"' && ok "refresh issues new access token" || bad "refresh"

log "== DB-backed endpoints (write org, read map) =="
ORG=$(curl -s -X POST "$B/orgs" -H "authorization: Bearer $AT" -H 'content-type: application/json' \
  -d '{"name":"Stack Check Org","industry":"technology"}')
echo "$ORG" | grep -q '"id"' && ok "create org (DB write)" || bad "create org"

# seeded demo org read (map + audit)
L=$(curl -s -X POST "$B/auth/login" -H 'content-type: application/json' -d '{"email":"dale@example.com","password":"Str0ng!Pass"}')
DAT=$(printf '%s' "$L" | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])" 2>/dev/null)
OID=$(curl -s "$B/auth/me" -H "authorization: Bearer $DAT" | python3 -c "import sys,json;d=json.load(sys.stdin);ms=d.get('memberships',[]);print(ms[0]['orgId'] if ms else '')" 2>/dev/null)
if [ -n "$OID" ]; then
  MAP=$(curl -s "$B/orgs/$OID/map" -H "authorization: Bearer $DAT")
  printf '%s' "$MAP" | python3 -c "import sys,json;d=json.load(sys.stdin);n=len(d.get('nodes',[]));e=len(d.get('edges',[]));sys.exit(0 if (n>0 and e>0) else 1)" 2>/dev/null \
    && ok "seeded map read (nodes+edges)" || bad "seeded map read"
  A=$(curl -s "$B/orgs/$OID/audit" -H "authorization: Bearer $DAT")
  printf '%s' "$A" | python3 -c "import sys,json;d=json.load(sys.stdin);k='events' if 'events' in d else 'items';sys.exit(0 if len(d.get(k,[]))>0 else 1)" 2>/dev/null \
    && ok "audit log read (append-only)" || bad "audit log read"
else
  bad "seeded map read (no org id)"
fi

log "== Frontend + proxy =="
if [ -n "$WEB_UP" ]; then
  ok "frontend serving on :$WEB_UP"
  P=$(curl -s -X POST "http://localhost:$WEB_UP/api/v1/auth/login" -H 'content-type: application/json' \
    -d '{"email":"dale@example.com","password":"Str0ng!Pass"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('user',{}).get('email',''))" 2>/dev/null)
  [ "$P" = "dale@example.com" ] && ok "Vite proxy forwards /api -> backend (login via frontend origin)" || bad "vite proxy"
else
  bad "frontend up (log: $(tail -3 /tmp/stack-web.log 2>/dev/null | tr '\n' ' '))"
fi

log "------------------------------------------"
log "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
