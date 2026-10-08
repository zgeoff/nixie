#!/bin/bash
# Run the worker start spike against a dev impd (see README.md). Prepares the image
# nixie-spike-worker-tpl, creates the imps nixie-spike-*, the secret nixie-spike-model and the host
# MCP server, runs every phase into results/, and removes them all on exit.
#
# Env: IMP_URL and IMP_TOKEN of the dev instance (required, so a run never reaches the saved
#      default host), CLAUDE_CODE_OAUTH_TOKEN (the model token: host turns and the broker secret),
#      SPIKE_WORK (scratch directory), SPIKE_SAMPLES (default 10), NIXIE_MODEL (default
#      claude-haiku-5-5).
set -euo pipefail

: "${IMP_URL:?set IMP_URL to the dev instance}" "${IMP_TOKEN:?set IMP_TOKEN}"
: "${CLAUDE_CODE_OAUTH_TOKEN:?set CLAUDE_CODE_OAUTH_TOKEN}" "${SPIKE_WORK:?set SPIKE_WORK}"
case $IMP_URL in
  http://localhost:*) ;;
  *) echo "run.sh: IMP_URL must be a local dev instance, not $IMP_URL" >&2; exit 1 ;;
esac

here=$(cd "$(dirname "$0")" && pwd)
samples=${SPIKE_SAMPLES:-10}
golden=nixie-spike-golden
box=nixie-spike-w
template=nixie-spike-worker-tpl
secret=nixie-spike-model
# the Docker bridge gateway: the host as the imps' host container sees it
mcp_host=172.17.0.1
mcp_port=8791
made_secret= made_template= serve_pid=

# cleanup removes every nixie-spike-* imp (bench.ts names its own that way), then the rest
cleanup() {
  [ -n "$serve_pid" ] && { kill "$serve_pid" 2>/dev/null || true; }
  for name in $(imp ls --json 2>/dev/null | jq -r '.[].name' | grep '^nixie-spike-' || true); do
    imp rm "$name" >/dev/null 2>&1 || true
  done
  [ -n "$made_template" ] && { imp template rm "$template" >/dev/null 2>&1 || true; }
  [ -n "$made_secret" ] && { imp secret rm "$secret" >/dev/null 2>&1 || true; }
}
trap cleanup EXIT

step() { printf '\n== %s\n' "$*"; }
in_golden() { imp exec "$golden" -- sh -c "$1"; }
bench() { (cd "$here" && bun bench.ts "$@"); }

step "versions and pre-existing state"
imp info | head -3
uname -r
bun --version
imp ls
mkdir -p "$SPIKE_WORK/home" "$here/results"

step "prepare $golden: ca-certificates, Bun, the spike package"
imp new "$golden" --image ubuntu --memory 2g >/dev/null
in_golden "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates >/dev/null 2>&1"
imp cp "$(command -v bun)" "$golden:/usr/local/bin/bun"
stage=$SPIKE_WORK/stage/app
rm -rf "$stage" && mkdir -p "$stage"
cp "$here"/package.json "$here"/bun.lock "$here"/turn.ts "$stage/"
imp cp "$stage" "$golden:/"
in_golden "cd /app && start=\$(date +%s%N) && bun install --frozen-lockfile >/dev/null 2>&1 \
  && echo \"bun install: \$(( (\$(date +%s%N) - start) / 1000000 )) ms\""
in_golden "du -sh /usr/local/bin/bun /app/node_modules /app/node_modules/@anthropic-ai/* && df -h / | tail -1"
imp stop "$golden"
imp template create "$golden" "$template" >/dev/null
made_template=1
imp rm "$golden" >/dev/null
imp image ls

step "the model secret and the host MCP server"
printf '%s' "$CLAUDE_CODE_OAUTH_TOKEN" | imp secret add "$secret" --kind custom \
  --hosts api.anthropic.com --header authorization --scheme bearer >/dev/null
made_secret=1
mcp_token=$(openssl rand -hex 24)
NIXIE_MCP_HOST=$mcp_host NIXIE_MCP_PORT=$mcp_port NIXIE_MCP_TOKEN=$mcp_token \
  bun "$here/serve.ts" > "$SPIKE_WORK/serve.log" 2>&1 &
serve_pid=$!
until grep -q listening "$SPIKE_WORK/serve.log"; do
  kill -0 "$serve_pid" 2>/dev/null || { cat "$SPIKE_WORK/serve.log"; exit 1; }
  sleep 0.2
done
head -1 "$SPIKE_WORK/serve.log"

export SPIKE_TEMPLATE=$template SPIKE_SECRET=$secret SPIKE_BOX=$box SPIKE_ALLOW=$mcp_host/32
export NIXIE_MCP_URL=http://$mcp_host:$mcp_port/mcp NIXIE_MCP_TOKEN=$mcp_token
export NIXIE_MODEL=${NIXIE_MODEL:-claude-haiku-5-5} SPIKE_HOME=$SPIKE_WORK/home

step "warm-up creates, so impd has a boot template for this shape; not summarized"
SPIKE_TAG=warmup bench lifecycle 2

step "the long-lived imp $box, granted, with one turn to settle it"
imp new "$box" --image "$template" --memory 2g --policy box --allow "$mcp_host/32" >/dev/null
imp grant "$box" "$secret" >/dev/null
imp policy "$box"
imp exec --require broker "$box" -- sh -c "cd /app && NIXIE_PLACEMENT=imp NIXIE_TOOLS=3 \
  NIXIE_MCP_URL=$NIXIE_MCP_URL NIXIE_MCP_TOKEN=$mcp_token NIXIE_MODEL=$NIXIE_MODEL bun turn.ts"

for phase in cli lifecycle wake sdk e2e-new e2e-wake; do
  step "phase $phase"
  bench "$phase" "$samples" | cut -c1-240
done

step "host MCP server requests by path"
sort "$SPIKE_WORK/serve.log" | uniq -c

step "imp audit $box"
imp audit "$box" | head -8

step "summary"
(cd "$here" && bun summarize.ts)

step "impd's own timing of each create, restore and wake"
if [ -n "${IMP_DEV_NAME:-}" ]; then
  docker logs "$IMP_DEV_NAME" 2>&1 | grep -E 'nixie-spike-' | grep -E 'created in|restored|booted|woke|slept' \
    > "$here/results/impd.log" || true
  wc -l < "$here/results/impd.log"
fi

step "token check: the token's own value in any file this run wrote"
if grep -rlF "$CLAUDE_CODE_OAUTH_TOKEN" "$here/results" "$SPIKE_WORK"; then
  echo "the token is in the files above"
else
  echo "clean"
fi
