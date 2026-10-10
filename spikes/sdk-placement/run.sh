#!/bin/bash
# Run the SDK placement spike against a dev impd (see README.md). Creates the imps nixie-spike-a
# (the run_code sandbox) and nixie-spike-b (Option B's SDK), the secret nixie-spike-model and the
# host MCP server, runs both options, and removes them all on exit.
#
# Env: IMP_URL and IMP_TOKEN of the dev instance (required, so a run never reaches the saved
#      default host), SPIKE_WORK (scratch directory for notes, logs and the staged copy),
#      CLAUDE_CODE_OAUTH_TOKEN (the model token, read from the vault; see README.md).
set -euo pipefail

: "${IMP_URL:?set IMP_URL to the dev instance}" "${IMP_TOKEN:?set IMP_TOKEN}"
: "${SPIKE_WORK:?set SPIKE_WORK}" "${CLAUDE_CODE_OAUTH_TOKEN:?set CLAUDE_CODE_OAUTH_TOKEN}"
case $IMP_URL in
  http://localhost:*) ;;
  *) echo "run.sh: IMP_URL must be a local dev instance, not $IMP_URL" >&2; exit 1 ;;
esac

here=$(cd "$(dirname "$0")" && pwd)
run_box=nixie-spike-a
sdk_box=nixie-spike-b
secret=nixie-spike-model
# the Docker bridge gateway: the host as the imps' host container sees it
mcp_host=172.17.0.1
mcp_port=8787
# cleanup removes only what this run created
made_run= made_sdk= made_secret= serve_pid=

cleanup() {
  [ -n "$serve_pid" ] && { kill "$serve_pid" 2>/dev/null || true; }
  [ -n "$made_sdk" ] && { imp rm "$sdk_box" >/dev/null 2>&1 || true; }
  [ -n "$made_run" ] && { imp rm "$run_box" >/dev/null 2>&1 || true; }
  [ -n "$made_secret" ] && { imp secret rm "$secret" >/dev/null 2>&1 || true; }
}
trap cleanup EXIT

step() { printf '\n== %s\n' "$*"; }
in_sdk() { imp exec "$sdk_box" -- sh -c "$1"; }
probe() { in_sdk "curl -sS --max-time 10 -o /dev/null -w '%{http_code}\n' $1 || true"; }

# One guest run, behind connect-log.ts, then the CONNECT log and the CLI's debug log copied out.
guest_run() {
  local name=$1 flags=${2:-}
  imp exec --require broker "$sdk_box" -- sh -c "cd /root/sdk-placement \
    && : > /tmp/claude-debug.log \
    && { bun connect-log.ts 7999 > /tmp/connect.log 2>&1 & echo \$! > /tmp/connect.pid; } \
    && sleep 0.5 \
    && NIXIE_CONNECT_LOG=http://127.0.0.1:7999 bun --env-file=guest.env guest.ts $flags; \
    sleep 1; kill \$(cat /tmp/connect.pid); echo '-- CONNECT log'; cat /tmp/connect.log"
  imp cp "$sdk_box:/tmp/claude-debug.log" "$SPIKE_WORK/out/$name-debug.log" 2>/dev/null
}

step "imp version and pre-existing state"
imp info | head -1
imp ls
mkdir -p "$SPIKE_WORK/notes" "$SPIKE_WORK/out"
export NIXIE_NOTES_DIR=$SPIKE_WORK/notes NIXIE_RUN_BOX=$run_box

step "create $run_box for run_code, policy none"
imp new "$run_box" --image ubuntu --memory 1g --policy none >/dev/null
made_run=1

step "Option A: the task"
(cd "$here" && env -u ANTHROPIC_API_KEY bun --no-env-file host-a.ts)
ls "$SPIKE_WORK/notes"

step "Option A: ask for built-in tools by name"
(cd "$here" && env -u ANTHROPIC_API_KEY bun --no-env-file host-a.ts --probe)

step "Option B: create $sdk_box, install curl and Bun while the policy is open"
imp new "$sdk_box" --image ubuntu --memory 2g >/dev/null
made_sdk=1
in_sdk "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates >/dev/null 2>&1"
imp cp "$(command -v bun)" "$sdk_box:/usr/local/bin/bun"
stage=$SPIKE_WORK/stage/sdk-placement
mkdir -p "$stage"
cp "$here"/package.json "$here"/bun.lock "$here"/*.ts "$stage/"
imp cp "$stage" "$sdk_box:/root"
in_sdk "cd /root/sdk-placement && bun install --frozen-lockfile >/dev/null 2>&1 && bun --version"

step "Option B: policy box with the host address only, then the model grant"
imp policy "$sdk_box" box --allow "$mcp_host/32"
printf '%s' "$CLAUDE_CODE_OAUTH_TOKEN" \
  | imp secret add "$secret" --kind custom --hosts api.anthropic.com --header authorization \
    --scheme bearer >/dev/null
made_secret=1
imp grant "$sdk_box" "$secret"
imp policy "$sdk_box"
imp grants "$sdk_box"

step "Option B: start the host MCP server with a fresh bearer token"
mcp_token=$(openssl rand -hex 24)
(umask 077 && printf 'NIXIE_MCP_URL=http://%s:%s/mcp\nNIXIE_MCP_TOKEN=%s\n' \
  "$mcp_host" "$mcp_port" "$mcp_token" > "$SPIKE_WORK/guest.env")
NIXIE_MCP_HOST=$mcp_host NIXIE_MCP_PORT=$mcp_port NIXIE_MCP_TOKEN=$mcp_token \
  bun "$here/serve.ts" > "$SPIKE_WORK/serve.log" 2>&1 &
serve_pid=$!
until grep -q listening "$SPIKE_WORK/serve.log"; do
  kill -0 "$serve_pid" 2>/dev/null || { cat "$SPIKE_WORK/serve.log"; exit 1; }
  sleep 0.2
done
cat "$SPIKE_WORK/serve.log"
imp cp "$SPIKE_WORK/guest.env" "$sdk_box:/root/sdk-placement/guest.env"

step "Option B: routes from inside $sdk_box"
in_sdk "env | grep -E '^(HTTPS_PROXY|NO_PROXY|SSL_CERT_FILE|NODE_EXTRA_CA_CERTS|NODE_USE_ENV_PROXY)=' | sort"
echo "-- example.com through the broker"
probe https://example.com/
echo "-- 1.1.1.1 direct"
probe "--noproxy '*' https://1.1.1.1/"
echo "-- api.anthropic.com direct, past the broker"
probe "--noproxy '*' https://api.anthropic.com/"
echo "-- the MCP endpoint without its token"
probe "http://$mcp_host:$mcp_port/mcp"
echo "-- impd's API port on the same host address"
probe "http://$mcp_host:7470/"

step "Option B: the task"
guest_run task

step "Option B: the task without CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"
guest_run nonessential --nonessential

step "Option B: the MCP host left on the broker's proxy"
guest_run keep-proxy --keep-proxy
grep -E 'MCP server "nixie".*(rejected|failed)' "$SPIKE_WORK/out/keep-proxy-debug.log" | cut -c1-200 || true

step "Option B: host MCP server log"
cat "$SPIKE_WORK/serve.log"

step "Option B: imp audit"
imp audit "$sdk_box"

step "token check"
if grep -rl 'sk-ant' "$SPIKE_WORK"; then echo "a token leaked into the files above"; else echo "clean"; fi
