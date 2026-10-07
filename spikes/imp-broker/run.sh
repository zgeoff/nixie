#!/bin/bash
# Run the imp broker spike against a dev impd (see README.md). Creates the imp
# nixie-spike-a and the secrets nixie-spike-api and nixie-spike-auth, runs
# every check, and removes them all on exit.
#
# Env: IMP_URL and IMP_TOKEN of the dev instance (required, so a run never
#      reaches the saved default host), IMP_DEV_DATA (its data directory),
#      SPIKE_WORK (scratch directory for the mock's certificates).
set -euo pipefail

: "${IMP_URL:?set IMP_URL to the dev instance}" "${IMP_TOKEN:?set IMP_TOKEN}"
: "${IMP_DEV_DATA:?set IMP_DEV_DATA}" "${SPIKE_WORK:?set SPIKE_WORK}"
case $IMP_URL in
  http://localhost:*) ;;
  *) echo "run.sh: IMP_URL must be a local dev instance, not $IMP_URL" >&2; exit 1 ;;
esac

here=$(cd "$(dirname "$0")" && pwd)
box=nixie-spike-a
api=nixie-spike-api
auth=nixie-spike-auth
upstreams=$IMP_DEV_DATA/broker-test-upstreams.json
mock_pid=

cleanup() {
  imp rm "$box" >/dev/null 2>&1 || true
  imp secret rm "$api" >/dev/null 2>&1 || true
  imp secret rm "$auth" >/dev/null 2>&1 || true
  rm -f "$upstreams"
  [ -n "$mock_pid" ] && kill "$mock_pid" 2>/dev/null || true
}
trap cleanup EXIT

step() { printf '\n== %s\n' "$*"; }
in_box() { imp exec "$box" -- sh -c "$1"; }

# curl through the broker; prints the status, then the body
broker_curl() { in_box "curl -sS --max-time 15 -w '\n%{http_code}\n' $1 || true"; }

# the mock's made-up client credential; it matches only mock.ts
mock_client=nixie-spike-client:dummy-client-secret # gitleaks:allow

# an access token straight from the mock, as a host-side refresher would get it
fetch_token() {
  curl -sS --cacert "$SPIKE_WORK/ca.pem" -u "$mock_client" \
    -d grant_type=client_credentials "https://172.17.0.1:9443/oauth/token" | jq -r .access_token
}

step "imp version and pre-existing state"
imp info | head -1
imp ls

step "start the mock"
mkdir -p "$SPIKE_WORK"
rm -f "$SPIKE_WORK/upstreams.json"
SPIKE_WORK=$SPIKE_WORK bun "$here/mock.ts" >"$SPIKE_WORK/mock.log" 2>&1 &
mock_pid=$!
until [ -f "$SPIKE_WORK/upstreams.json" ]; do
  kill -0 "$mock_pid" 2>/dev/null || { cat "$SPIKE_WORK/mock.log"; exit 1; }
  sleep 0.2
done
cp "$SPIKE_WORK/upstreams.json" "$upstreams"
head -1 "$SPIKE_WORK/mock.log"

step "create $box, install curl while open, then set policy none, secrets, grants"
imp new "$box" --memory 1g >/dev/null
in_box "apt-get update -qq && apt-get install -y -qq curl >/dev/null 2>&1"
imp policy "$box" none
fetch_token | imp secret add "$api" --kind custom --hosts api.nixie-spike.test >/dev/null
echo "${mock_client#*:}" | imp secret add "$auth" --kind custom --hosts auth.nixie-spike.test \
  --scheme basic --user nixie-spike-client >/dev/null
imp grant "$box" "$api"
imp grant "$box" "$auth"
imp policy "$box"
imp grants "$box"

step "Q3: the granted host answers through the broker under policy none"
broker_curl https://api.nixie-spike.test/v1/resource

step "Q3: an ungranted host through the broker"
broker_curl https://example.com/

step "Q3: a direct connection that skips the broker"
in_box "curl -sS --noproxy '*' --max-time 10 -o /dev/null -w '%{http_code}\n' https://1.1.1.1/ || true"

step "Q3: POST a 1 MiB body, a query string and a custom header to the granted host"
in_box "head -c 1048576 /dev/urandom > /tmp/blob"
broker_curl "-X POST --data-binary @/tmp/blob -H 'x-exfil: guest-data' 'https://api.nixie-spike.test/v1/messages?leak=guest-data'"

step "Q1: other methods and paths on the granted host carry the credential"
broker_curl "-X DELETE https://api.nixie-spike.test/v1/anything/at/all"
broker_curl "-X PUT -d x https://api.nixie-spike.test/v1/admin"

step "Q4: a Host header for another name"
broker_curl "-H 'Host: other.example' https://api.nixie-spike.test/v1/resource"

step "Q2: the guest asks the token endpoint; the broker adds the client credentials"
broker_curl "-d grant_type=client_credentials https://auth.nixie-spike.test/oauth/token"

step "Q2: wait past the 30 s expiry of the granted access token"
sleep 32
broker_curl https://api.nixie-spike.test/v1/resource

step "Q2: a host-side refresh replaces the secret; no grant changes"
fetch_token | imp secret add "$api" --kind custom --hosts api.nixie-spike.test --replace >/dev/null
broker_curl https://api.nixie-spike.test/v1/resource

step "Q4: imp audit"
imp audit "$box"
imp audit "$box" --json --limit 1

step "mock log (what the upstream saw)"
cat "$SPIKE_WORK/mock.log"
