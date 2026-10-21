#!/usr/bin/env bash
# Times the ways a fetch sandbox can start on impd, and prints one markdown table row per run.
# It needs bash, coreutils and the imp CLI logged in to the impd under test, nothing else.
#
#   FETCH_IMAGE=nixie-fetch-<hash> [CONVERSATION_IMAGE=nixie-conversation-<hash>] [RUNS=5] \
#     bash research/fetch-sandbox-start/time-starts.sh | tee fetch-sandbox-start.md
#
# Routes, each timed from the host clock around the CLI calls:
#   new        imp new from the fetch image, then a first exec of `true`
#   template   imp new from a template made from a prepared fetch imp, then a first exec
#   fork       imp fork of that prepared imp (stopped), a wake if the fork is not running, a first exec
#   wake       a kept fetch imp woken from sleep, then an exec: a sandbox kept per conversation
#   warm       an exec in that kept imp while it is awake: a warm pool's cost per fetch
#   conv       imp new from the conversation image, to reproduce its exit code, when it is set
#
# The script touches only imps and the one template it names with the geo1337- prefix, refuses to
# start when one exists, keeps at most one of its imps awake while it times, and removes all of
# them on exit. IMP_CLI names the CLI when it is not `imp`.
set -euo pipefail

IMP=${IMP_CLI:-imp}
FETCH_IMAGE=${FETCH_IMAGE:?set FETCH_IMAGE to the fetch image impd holds, such as nixie-fetch-<hash>}
CONVERSATION_IMAGE=${CONVERSATION_IMAGE:-}
RUNS=${RUNS:-5}
PREFIX=geo1337-
SOURCE=${PREFIX}src
KEEP=${PREFIX}keep
TEMPLATE=${PREFIX}tpl
CALL_LIMIT=180
POLL_LIMIT_MS=120000

# the fetch sandbox's shape, as web-fetch-defaults.ts and the imp adapter set it. The adapter also
# opts out of backups, which the imp CLI before 2.x has no flag for; a backup runs apart from a boot.
FETCH_SHAPE=(--cpus 1 --memory 512m --disk 4g --policy public)
# the conversation sandbox's shape, as start-conversation.ts sets it
CONVERSATION_SHAPE=(--cpus 2 --memory 2g --disk 4g --policy box --allow api.anthropic.com)

declare -A LIVE=()
HAS_TEMPLATE=0

now_ms() {
  date +%s%3N
}

log() {
  printf '%s\n' "$*" >&2
}

cleanup() {
  local name names

  names=$(list_names)

  for name in "${!LIVE[@]}"; do
    grep -qxF "$name" <<<"$names" || continue
    timeout "$CALL_LIMIT" "$IMP" rm "$name" >/dev/null 2>&1 || log "cleanup: could not remove $name"
  done

  if [[ $HAS_TEMPLATE == 1 ]]; then
    timeout "$CALL_LIMIT" "$IMP" template rm "$TEMPLATE" >/dev/null 2>&1 ||
      log "cleanup: could not remove template $TEMPLATE"
  fi

}

trap cleanup EXIT
trap 'exit 130' INT TERM

# runs one CLI call under the time limit; sets CALL_MS, CALL_EXIT and CALL_ERR (first stderr line)
run_call() {
  local start err

  start=$(now_ms)
  CALL_EXIT=0
  err=$(timeout "$CALL_LIMIT" "$IMP" "$@" 2>&1 >/dev/null) || CALL_EXIT=$?
  CALL_MS=$(($(now_ms) - start))
  CALL_ERR=$(printf '%s\n' "$err" | head -n 1 | tr '|' '/' | cut -c 1-160)

  # the whole error goes to stderr, since a row keeps only its first line
  if [[ $CALL_EXIT != 0 ]]; then
    log "$IMP $1 exited $CALL_EXIT after $CALL_MS ms: $err"
  fi
}

# Each reader parses the CLI's text output, which keeps one shape across the CLI's versions, and
# prints nothing, rather than failing, when impd does not answer. `imp info` prints a `version`
# line and an `imps  <n> (<m> awake)` line; `imp ls` and `imp template ls` print a table whose
# first column is the name and, for imps, whose second is the state.
read_impd_version() {
  { "$IMP" info 2>/dev/null || true; } | awk '$1 == "version" { print $2; exit }'
}

read_awake_count() {
  { "$IMP" info 2>/dev/null || true; } | sed -nE 's/^imps[[:space:]].*\(([0-9]+) awake\).*/\1/p' | head -n 1
}

list_names() {
  { "$IMP" ls 2>/dev/null || true; } | awk 'NR > 1 { print $1 }'
}

read_state() {
  { "$IMP" ls 2>/dev/null || true; } | awk -v name="$1" 'NR > 1 && $1 == name { print $2; exit }'
}

# waits for the imp to reach running; sets WAIT_MS and WAIT_STATE
wait_running() {
  local start

  start=$(now_ms)
  WAIT_STATE=$(read_state "$1")

  while [[ $WAIT_STATE != running && $(($(now_ms) - start)) -lt $POLL_LIMIT_MS ]]; do
    sleep 0.25
    WAIT_STATE=$(read_state "$1")
  done

  WAIT_MS=$(($(now_ms) - start))
}

remove_imp() {
  run_call rm "$1"
  RM_MS=$CALL_MS

  if [[ $CALL_EXIT == 0 ]]; then
    unset 'LIVE[$1]'
  else
    log "rm $1 exited $CALL_EXIT: $CALL_ERR"
  fi
}

print_row() {
  # route run impd awake create_exit create_ms wake_ms exec_ms total_ms rm_ms note
  printf '| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n' "$@"
}

# times one create route: $1 route, $2 run, then the CLI call that creates the imp named $3
time_create() {
  local route=$1 run=$2 name=$3
  shift 3
  local version awake create_exit create_ms create_err wake_ms=0 exec_ms total_ms note=""

  version=$(read_impd_version)
  awake=$(read_awake_count)
  LIVE[$name]=1

  run_call "$@"
  create_exit=$CALL_EXIT
  create_ms=$CALL_MS
  create_err=$CALL_ERR

  # a usage error means the CLI made no call, so every later run would fail the same way
  if [[ $create_exit == 2 ]]; then
    unset 'LIVE[$name]'
    log "$route $run: the CLI refused the create as a usage error; stopping"
    exit 2
  fi

  if [[ $create_exit != 0 ]]; then
    wait_running "$name"
    note="exit $create_exit: ${create_err}; then ${WAIT_STATE:-missing} after ${WAIT_MS} ms"
  fi

  if [[ $(read_state "$name") != running ]]; then
    run_call wake "$name"
    wake_ms=$CALL_MS
    [[ $CALL_EXIT == 0 ]] || note="${note:+$note; }wake exit $CALL_EXIT: $CALL_ERR"
  fi

  run_call exec "$name" -- true
  exec_ms=$CALL_MS
  [[ $CALL_EXIT == 0 ]] || note="${note:+$note; }exec exit $CALL_EXIT: $CALL_ERR"
  total_ms=$((create_ms + wake_ms + exec_ms))

  remove_imp "$name"
  print_row "$route" "$run" "$version" "$awake" "$create_exit" "$create_ms" "$wake_ms" "$exec_ms" \
    "$total_ms" "$RM_MS" "$note"
}

# times a wake of the kept imp, then a second exec while it is awake, then sleeps it again
time_kept() {
  local run=$1 version awake wake_exit wake_ms exec_ms note=""

  version=$(read_impd_version)
  awake=$(read_awake_count)

  run_call wake "$KEEP"
  wake_exit=$CALL_EXIT
  wake_ms=$CALL_MS
  [[ $wake_exit == 0 ]] || note="wake exit $wake_exit: $CALL_ERR"

  run_call exec "$KEEP" -- true
  exec_ms=$CALL_MS
  [[ $CALL_EXIT == 0 ]] || note="${note:+$note; }exec exit $CALL_EXIT: $CALL_ERR"
  print_row wake "$run" "$version" "$awake" "$wake_exit" 0 "$wake_ms" "$exec_ms" \
    $((wake_ms + exec_ms)) - "$note"

  run_call exec "$KEEP" -- true
  note=""
  [[ $CALL_EXIT == 0 ]] || note="exec exit $CALL_EXIT: $CALL_ERR"
  print_row warm "$run" "$version" "$(read_awake_count)" - 0 0 "$CALL_MS" "$CALL_MS" - "$note"

  run_call sleep "$KEEP"
  [[ $CALL_EXIT == 0 ]] || log "sleep $KEEP exited $CALL_EXIT: $CALL_ERR"
}

require_ok() {
  if [[ $CALL_EXIT != 0 ]]; then
    log "$1 exited $CALL_EXIT: $CALL_ERR"
    exit 1
  fi
}

refuse_existing() {
  local imps templates

  # a failed list stops the script here, before it creates anything
  imps=$("$IMP" ls | awk 'NR > 1 { print $1 }')
  templates=$("$IMP" template ls | awk 'NR > 1 { print $1 }')

  if grep -q "^${PREFIX}" <<<"$imps"; then
    log "an imp named ${PREFIX}* exists; remove it first"
    exit 1
  fi

  if grep -qxF "$TEMPLATE" <<<"$templates"; then
    log "the template $TEMPLATE exists; remove it first"
    exit 1
  fi
}

prepare() {
  log "preparing $SOURCE and $KEEP from $FETCH_IMAGE"

  # 2 warm-up creates, so impd has a boot template for the fetch shape before any timed run
  for run in w1 w2; do
    time_create new "$run" "${PREFIX}new-$run" new "${PREFIX}new-$run" --image "$FETCH_IMAGE" \
      "${FETCH_SHAPE[@]}"
  done

  LIVE[$SOURCE]=1
  run_call new "$SOURCE" --image "$FETCH_IMAGE" "${FETCH_SHAPE[@]}"
  require_ok "new $SOURCE"
  run_call exec "$SOURCE" -- sync
  require_ok "exec $SOURCE"
  run_call stop "$SOURCE"
  require_ok "stop $SOURCE"

  HAS_TEMPLATE=1
  run_call template create "$SOURCE" "$TEMPLATE"
  require_ok "template create"
  log "template create took $CALL_MS ms"

  LIVE[$KEEP]=1
  run_call new "$KEEP" --image "$FETCH_IMAGE" "${FETCH_SHAPE[@]}"
  require_ok "new $KEEP"
  run_call exec "$KEEP" -- true
  require_ok "exec $KEEP"
  run_call sleep "$KEEP"
  require_ok "sleep $KEEP"
}

main() {
  local run

  local version

  version=$(read_impd_version)
  log "imp CLI: $("$IMP" --version 2>&1 | head -n 1); impd: $version"

  if [[ -z $version || -z $(read_awake_count) ]]; then
    log "could not read impd's version and awake count from \`$IMP info\`; stopping"
    exit 1
  fi

  refuse_existing

  printf '| route | run | impd | awake before | create exit | create ms | wake ms | exec ms | total ms | rm ms | note |\n'
  printf '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'

  prepare

  # the routes take turns within each run, so a drift in host load reaches all of them alike
  for ((run = 1; run <= RUNS; run++)); do
    time_create new "$run" "${PREFIX}new-$run" new "${PREFIX}new-$run" --image "$FETCH_IMAGE" \
      "${FETCH_SHAPE[@]}"
    time_create template "$run" "${PREFIX}tpl-$run" new "${PREFIX}tpl-$run" --image "$TEMPLATE" \
      "${FETCH_SHAPE[@]}"
    time_create fork "$run" "${PREFIX}fork-$run" fork "$SOURCE" "${PREFIX}fork-$run"
    time_kept "$run"

    if [[ -n $CONVERSATION_IMAGE ]]; then
      time_create conv "$run" "${PREFIX}conv-$run" new "${PREFIX}conv-$run" \
        --image "$CONVERSATION_IMAGE" "${CONVERSATION_SHAPE[@]}"
    fi
  done
}

main
