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

# probe <name> <curl arguments>
probe() {
  name=$1
  shift
  status=$(curl -s --max-time 30 -o "$answer" -w '%{http_code}' "$@" \
    -H 'content-type: application/json' -H 'anthropic-version: 2023-06-01' -d "$body")
  printf '%s\t%s\t%s\n' "$name" "$status" "$(head -c 200 "$answer" | tr '\n' ' ')"
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

# around the broker: the guest's open egress reaches the API, with no credential on the request
probe direct-no-broker --noproxy '*' https://api.anthropic.com/v1/messages
probe route-listener --noproxy '*' --connect-timeout 5 "$listener/$imp/v1/messages"
