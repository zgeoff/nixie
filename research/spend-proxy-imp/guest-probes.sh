#!/bin/sh
# Runs in a preview imp's guest: each probe tries a way to the model API around the imp's counted
# route, and prints its name, the HTTP status and the start of the answer. Each probe sends no
# credential, so one that reaches the API without the broker adding its credential gets a 401.
# Usage: sh guest-probes.sh <imp> <route_listener_origin>
set -u

imp=$1
listener=$2
body='{"model":"claude-haiku-5-5","max_tokens":16,"messages":[{"role":"user","content":"Say hi."}]}'
answer=$(mktemp)
trap 'rm -f "$answer"' EXIT

failed=0

# probe <name> [--refused-ok] <curl arguments>: a probe whose request gets no HTTP answer prints
# status 000 and curl's exit code, and the script exits 1 after the last probe. With --refused-ok, a
# refused connection (curl exit 7) is the probe's answer, and leaves the exit code alone.
probe() {
  name=$1
  shift
  refused_ok=0
  if [ "${1:-}" = --refused-ok ]; then
    refused_ok=1
    shift
  fi
  : > "$answer"
  if status=$(curl -s --max-time 30 -o "$answer" -w '%{http_code}' "$@" \
    -H 'content-type: application/json' -H 'anthropic-version: 2023-06-01' -d "$body"); then
    printf '%s\t%s\t%s\n' "$name" "$status" "$(head -c 200 "$answer" | tr '\n' ' ')"
  else
    code=$?
    printf '%s\t000\tcurl exit %s\n' "$name" "$code"
    if [ "$refused_ok" -eq 0 ] || [ "$code" -ne 7 ]; then
      failed=1
    fi
  fi
}

# the imp's own route, where the broker adds the credential and the counting proxy counts the reply
probe own-route "https://api.anthropic.com/$imp/v1/messages"

# the broker's grant covers only /<imp>/**, so each of these needs a refusal from the broker
probe unrouted https://api.anthropic.com/v1/messages
probe other-route https://api.anthropic.com/pv-00000000-1/v1/messages
probe dot-segment --path-as-is "https://api.anthropic.com/$imp/../v1/messages"
probe encoded-dot-segment --path-as-is "https://api.anthropic.com/$imp/%2e%2e/v1/messages"
probe encoded-slash "https://api.anthropic.com/$imp%2F..%2Fv1/messages"
probe double-slash --path-as-is "https://api.anthropic.com//v1/messages"

# inside the route, the counting proxy refuses an endpoint whose spend it cannot count
probe batches "https://api.anthropic.com/$imp/v1/messages/batches"

# around the broker: the guest's egress reaches the API, with no credential on the request
probe direct-no-broker --noproxy '*' https://api.anthropic.com/v1/messages
# a host that closes its model route listener to the guest refuses the connection
probe route-listener --refused-ok --noproxy '*' --connect-timeout 5 "$listener/$imp/v1/messages"

exit "$failed"
