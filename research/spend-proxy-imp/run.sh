#!/bin/bash
# every remote command takes its values from this machine's environment
# shellcheck disable=SC2029

# Runs the spike against one preview of a nixie pull request on a preview host whose spend cap is
# on (see README.md). It reads the imp's grants and its route, enrols a device, sends a plain turn
# and a turn that starts a task, reads the proxy's count after each, runs the guest probes, and
# reads the broker's audit. It writes each step's output to SPIKE_WORK and changes nothing on the
# host: the preview service owns the imp, its grants and its proxy.
#
# Env: PREVIEW_SSH (the SSH target of the preview host, as root), IMP_CLI (the command that runs
#      imp's CLI as impd's root on that host), IMP (the preview's imp name), ORIGIN (the
#      preview's HTTPS origin), COMPOSE_FILE (the preview's compose.yaml inside the imp),
#      SPEND_DIR (the preview service's spend directory on the host), ROUTE_LISTENER (the
#      origin of the preview service's model route listener, the upstream of the counted
#      grant), SPIKE_WORK (scratch
#      directory), SPIKE_TOKEN (optional: the device token an earlier run on this preview
#      enrolled, since a sign-in code works once).
set -euo pipefail

: "${PREVIEW_SSH:?set PREVIEW_SSH}" "${IMP_CLI:?set IMP_CLI}" "${IMP:?set IMP}"
: "${ORIGIN:?set ORIGIN}" "${COMPOSE_FILE:?set COMPOSE_FILE}" "${SPEND_DIR:?set SPEND_DIR}"
: "${ROUTE_LISTENER:?set ROUTE_LISTENER}" "${SPIKE_WORK:?set SPIKE_WORK}"

here=$(cd "$(dirname "$0")" && pwd)
compose=$COMPOSE_FILE
mkdir -p "$SPIKE_WORK"

# host <command>: one command on the preview host, with nothing on its standard input
host() { ssh "$PREVIEW_SSH" "$1" < /dev/null; }
host_imp() { host "$IMP_CLI $1"; }
# a preview whose proxy never started has no count file, and any other read error stops the spike
read_count() {
  host "if [ -e $SPEND_DIR/$IMP.count.json ]; then cat $SPEND_DIR/$IMP.count.json; else echo none; fi"
}

# rpc <procedure> <input>: one call to the preview's API with the enrolled device's token
rpc() {
  jq -n --argjson input "$2" '{json: $input}' |
    curl -sS --fail-with-body -X POST "$ORIGIN/rpc/$1" -H 'content-type: application/json' \
      -H 'x-nixie-client: spike' -H "authorization: Bearer $token" -d @-
}

# send_turn <name> <text>: sends one message and waits until its step ends
send_turn() {
  local sent
  sent=$(rpc conversation/send "$(jq -n --arg id "$(uuidgen)" --arg text "$2" \
    '{clientMessageId: $id, text: $text, thread: "conversation",
      spans: [{start: 0, end: ($text | length), source: "typed"}]}')" | jq .json.sequence)
  if ! [[ $sent =~ ^[0-9]+$ ]]; then
    echo "run.sh: the $1 turn's send returned no sequence: $sent" >&2
    exit 1
  fi
  for _ in $(seq 1 60); do
    rpc conversation/read '{"thread":"conversation","limit":200}' > "$SPIKE_WORK/$1-page.json"
    if jq -e --argjson sent "$sent" '.json.lastStepEnd.sequence > $sent' \
      "$SPIKE_WORK/$1-page.json" > /dev/null; then
      jq -c --argjson sent "$sent" '.json.records[] | select(.sequence >= $sent)
        | {sequence, kind, text: .message.text}' "$SPIKE_WORK/$1-page.json" > "$SPIKE_WORK/$1.jsonl"
      return
    fi
    sleep 5
  done
  echo "run.sh: the $1 turn did not end in 5 minutes" >&2
  exit 1
}

echo "== the imp's grants, egress policy and model route"
{
  host_imp "grants $IMP"
  host_imp "policy $IMP"
  host_imp "exec $IMP -- docker compose -f $compose exec -T nixie sh -c 'printenv NIXIE_PREVIEW_MODEL_ROUTE; grep base_url /var/lib/nixie-preview/config.yaml'"
} | tee "$SPIKE_WORK/route.txt"

count=$(read_count)
echo "$count" > "$SPIKE_WORK/count-0.json"
echo "== the count before the turns: $count"

token=${SPIKE_TOKEN:-}
if [ -z "$token" ]; then
  code=$(host_imp "exec $IMP -- docker compose -f $compose logs --no-log-prefix enrol" | head -1)
  if ! token=$(jq -n --arg id "$(uuidgen)" --arg code "$code" \
    '{json: {clientActionID: $id, code: $code, deviceName: "spike", tokenDelivery: "bearer"}}' |
    curl -sS --fail-with-body -X POST "$ORIGIN/rpc/sessions/enrol" \
      -H 'content-type: application/json' -H 'x-nixie-client: spike' -d @- | jq -r .json.token) ||
    [ "$token" = null ]; then
    echo "run.sh: the sign-in code $code was refused; set SPIKE_TOKEN or get a new code" >&2
    exit 1
  fi
fi

send_turn plain 'What is two plus two? Answer in one short sentence.'
count=$(read_count)
echo "$count" > "$SPIKE_WORK/count-1.json"
echo "== the count after the plain turn: $count"

# the task this turn starts is the one task that was not there before it, so an earlier run's
# task never stands in for it
known_tasks=$(rpc tasks/list '{}' | jq -c '[.json.tasks[].taskID]')
send_turn task "Start a task named 'tide note' whose brief is: write one sentence on why the sea has tides. Then tell me you started it."
task=$(rpc tasks/list '{}' |
  jq -r --argjson known "$known_tasks" '.json.tasks[] | select(.taskID as $id | $known | index($id) | not) | .taskID' |
  head -1)
if [ -z "$task" ]; then
  # a failed model call ends the turn before the conversation can start the task
  echo "== the conversation started no task; $SPIKE_WORK/task.jsonl holds its turn"
else
  ended=''
  for _ in $(seq 1 60); do
    rpc conversation/read "$(jq -n --arg task "$task" '{thread: $task, limit: 200}')" > "$SPIKE_WORK/task-page.json"
    if jq -e '.json.lastStepEnd != null' "$SPIKE_WORK/task-page.json" > /dev/null; then
      ended=yes
      break
    fi
    sleep 5
  done
  if [ -z "$ended" ]; then
    echo "run.sh: the task's step did not end in 5 minutes" >&2
    exit 1
  fi
  jq -c '.json.records[] | {sequence, kind, text: .message.text}' "$SPIKE_WORK/task-page.json" > "$SPIKE_WORK/task-thread.jsonl"
fi
count=$(read_count)
echo "$count" > "$SPIKE_WORK/count-2.json"
echo "== the count after the task's step: $count"

echo "== nixie's own token counts, from the turn-ended records of each thread"
ssh "$PREVIEW_SSH" "$IMP_CLI exec $IMP -- docker compose -f $compose exec -T nixie sh -c 'cat > /tmp/read-turn-usage.ts && bun /tmp/read-turn-usage.ts'" \
  < "$here/read-turn-usage.ts" | tee "$SPIKE_WORK/turn-usage.jsonl"

echo "== the guest probes"
ssh "$PREVIEW_SSH" "$IMP_CLI exec $IMP -- sh -s $IMP $ROUTE_LISTENER" < "$here/guest-probes.sh" | tee "$SPIKE_WORK/probes.tsv"
count=$(read_count)
echo "$count" > "$SPIKE_WORK/count-3.json"
echo "== the count after the probes: $count"

echo "== the broker's audit: requests with a credential, then refusals"
{
  host_imp "audit $IMP --limit 50"
  host_imp "audit $IMP --kind refused --limit 50"
} | tee "$SPIKE_WORK/audit.txt"
