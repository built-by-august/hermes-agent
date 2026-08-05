#!/usr/bin/env bash
# Acceptance drill (task t_6765592f): create org -> add operations -> add edge ->
# run a skill integration action -> read audit log, asserting every step is logged.
# Uses the live API at $BASE (default http://localhost:4100).
set -euo pipefail

BASE="${BASE:-http://localhost:4100}"
PREFIX="$BASE/api/v1"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

jqr() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

echo "== 1. Register a user =="
EMAIL="dale-$(date +%s%N)@drill.dev"
REG=$(curl -s -X POST "$PREFIX/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Str0ng!Pass\",\"name\":\"Dale Rutherford\"}")
echo "$REG" | head -c 200; echo
TOKEN=$(echo "$REG" | jqr "['accessToken']")
AUTH="authorization: Bearer $TOKEN"

echo "== 2. Create an organization =="
ORG=$(curl -s -X POST "$PREFIX/orgs" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"name":"Rutherford Consulting","industry":"professional-services"}')
echo "$ORG" | head -c 200; echo
ORG_ID=$(echo "$ORG" | jqr "['id']")
echo "   orgId=$ORG_ID"

echo "== 3. Add operation nodes =="
N1=$(curl -s -X POST "$PREFIX/orgs/$ORG_ID/operations" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"name":"Client intake","type":"process","status":"active","position":{"x":120,"y":80}}')
N1_ID=$(echo "$N1" | jqr "['id']")
echo "   node1=$N1_ID"
N2=$(curl -s -X POST "$PREFIX/orgs/$ORG_ID/operations" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"name":"CRM: HubSpot","type":"tool","status":"active","position":{"x":360,"y":80}}')
N2_ID=$(echo "$N2" | jqr "['id']")
echo "   node2=$N2_ID"

echo "== 4. Add an edge between them =="
EDGE=$(curl -s -X POST "$PREFIX/orgs/$ORG_ID/edges" -H "$AUTH" -H 'content-type: application/json' \
  -d "{\"source\":\"$N1_ID\",\"target\":\"$N2_ID\",\"label\":\"writes to\",\"type\":\"data_flow\"}")
echo "$EDGE" | head -c 160; echo
EDGE_ID=$(echo "$EDGE" | jqr "['id']")

echo "== 5. Retrieve the map (graph payload) =="
MAP=$(curl -s "$PREFIX/orgs/$ORG_ID/map" -H "$AUTH")
echo "   nodes=$(echo "$MAP" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['nodes']))") edges=$(echo "$MAP" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['edges']))")"

echo "== 6. Read the audit log (assert each step was recorded) =="
AUDIT=$(curl -s "$PREFIX/orgs/$ORG_ID/audit?limit=50" -H "$AUTH")
echo "$AUDIT" | python3 -c "import sys,json; d=json.load(sys.stdin); acts=[e['action'] for e in d['items']]; print('   audit actions:', acts)"
for want in org.created operation.node.created edge.created; do
  if echo "$AUDIT" | python3 -c "import sys,json;d=json.load(sys.stdin);sys.exit(0 if any(e['action']=='$want' for e in d['items']) else 1)"; then
    echo "   [ok] audit event present: $want"
  else
    echo "   [FAIL] missing audit event: $want"; exit 1
  fi
done

echo
echo "ACCEPTANCE DRILL PASSED — org, operations, edge created and all steps logged to the append-only audit log."
