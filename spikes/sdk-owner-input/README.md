# Spike: owner messages into a running task

This spike sends an owner message into an Agent SDK session while the model works through a task,
once for each value of `SDKUserMessage.priority`, and records when the model reads it.

- SDK: `@anthropic-ai/claude-agent-sdk` 0.3.292, which runs its bundled Claude Code 2.1.292
- Model: `claude-haiku-4-5-20251001`
- Options: `settingSources: []`, `permissionMode: 'default'`, `allowedTools: ['Bash']`,
  `permissionPrompts: 'none'`, and an `env` that passes only `PATH`, `HOME`, and the OAuth token

## Question

With streaming input, an owner sends a message mid-task with each priority the SDK offers: `next`,
`later`, `now`, and `now` with `origin: { kind: 'human' }`. When does each one reach the model?

## Run it

Run each command from this directory.

```bash
bun install
env -u ANTHROPIC_API_KEY bun --env-file=../../.env owner.ts next --step 20
env -u ANTHROPIC_API_KEY bun --env-file=../../.env owner.ts later
env -u ANTHROPIC_API_KEY bun --env-file=../../.env owner.ts now --step 20
env -u ANTHROPIC_API_KEY bun --env-file=../../.env owner.ts now --human --step 20
```

The task is 4 Bash commands that the model runs one at a time, each `sleep <step> && echo step-<n>`.
The step is 5 s, or the value of `--step`. The owner message is a request to include the word
PINEAPPLE in the next reply. `owner.ts` sends it 1.5 s after the first `tool_use`, while the first
command runs, and stamps it with a `uuid`. Claude Code puts that `uuid` in `user_message_uuids` on
the first assistant message that reads the owner message, so the log line `OWNER MESSAGE CONSUMED`
marks the moment the model reads it.

## Answer

- `next`:
  - The model reads the message after the running command finishes.
  - The command runs to the end, and the same turn goes on.
- `later`:
  - The model reads the message after the turn ends.
  - The message starts a new turn after the `result`.
- `now`:
  - The model reads the message after the running command finishes.
  - The command runs to the end. The turn ends there with `stop_reason: tool_use`, and a new turn
    starts.
- `now` with a `human` origin:
  - The model reads the message about 4.5 s after the send.
  - Claude Code moves the command to the background. The turn ends with `stop_reason: tool_use`, and
    a new turn starts.

Only `now` with a `human` origin reaches the model before a 20 s command finishes. Plain `now` waits
for the same tool boundary as `next`, and differs only in that it ends the turn there.

### `next`

The model reads the message at the first tool boundary, about 19 s after the send, and the same turn
goes on:

```text
3.4s tool_use {"command":"sleep 20 && echo step-1"}
4.9s OWNER SENDS priority=next human=false
23.6s tool_result "step-1"
24.8s OWNER MESSAGE CONSUMED by this assistant message
25.2s assistant "Got it — I'll include PINEAPPLE in this reply as requested. Now continuing with step-2:"
89.9s result #1 success stop_reason=end_turn "DONE ..."
```

### `later`

The model finishes the whole task first, and the message starts a second turn:

```text
4.6s OWNER SENDS priority=later human=false
27.9s assistant "DONE"
28.0s result #1 success stop_reason=end_turn "DONE"
29.4s OWNER MESSAGE CONSUMED by this assistant message
29.7s result #2 success stop_reason=end_turn "Got it! I'll include PINEAPPLE ..."
```

### `now`

The SDK docs say a plain `now` interrupts the turn. In these runs the running Bash command is not
cut short. The turn ends at the next tool boundary, and the message starts a new turn that carries
on with the task:

```text
3.8s tool_use {"command":"sleep 20 && echo step-1"}
5.3s OWNER SENDS priority=now human=false
24.0s tool_result "step-1"
24.0s result #1 success stop_reason=tool_use ""
25.3s OWNER MESSAGE CONSUMED by this assistant message
25.7s assistant "PINEAPPLE! Step 1 is complete. Continuing with step 2:"
```

### `now` with a `human` origin

Claude Code moves the running command to the background, ends the turn, and the model reads the
message in a new turn. The command keeps running, and its completion wakes the model again to go on
with the task:

```text
3.4s tool_use {"command":"sleep 20 && echo step-1"}
4.9s OWNER SENDS priority=now human=true
6.7s system task_updated {"patch":{"is_backgrounded":true}, ...}
7.6s tool_result "Command was moved to the background (ID: …) so that a message that arrived while it was running can reach you; it was not interrupted. ..."
7.6s result #1 success stop_reason=tool_use ""
9.4s OWNER MESSAGE CONSUMED by this assistant message
10.3s result #2 success stop_reason=end_turn "Understood! I'll include PINEAPPLE in this reply. The first command is running in the background ..."
23.6s system task_updated {"patch":{"status":"completed", ...}}
25.1s tool_use {"command":"sleep 20 && echo step-2"}
```

With 5 s commands, the same move happens about 2.7 s after the send. Only work that can run in the
background moves: the SDK docs name shell commands, subagents, MCP tool calls, WebFetch, and
WebSearch.

## Untested

[cases.ts](./cases.ts) holds a script for each case below, and none of them has run yet. Run each
command from this directory:

```bash
env -u ANTHROPIC_API_KEY bun --env-file=../../.env cases.ts text
env -u ANTHROPIC_API_KEY bun --env-file=../../.env cases.ts text --human
env -u ANTHROPIC_API_KEY bun --env-file=../../.env cases.ts slow-tool
env -u ANTHROPIC_API_KEY bun --env-file=../../.env owner.ts none --step 20
env -u ANTHROPIC_API_KEY bun --env-file=../../.env cases.ts defer
env -u ANTHROPIC_API_KEY bun --env-file=../../.env cases.ts interrupt
```

- A `now` message while the model writes text with no tool running (`text`). The SDK docs say Claude
  Code interrupts the turn in that case.
- A `now` message with a `human` origin during a tool that cannot move to the background
  (`slow-tool`, an in-process tool that sleeps 20 s). The SDK types name only WebFetch and WebSearch
  as tools that step aside for a user message.
- A message with no `priority` field (`owner.ts none`). The SDK docs give it the behavior of `next`.
- `shouldQuery: false` (`defer`). The SDK types say such a message joins the transcript without
  starting a turn and merges into the next message that does.
- `interrupt()` with a queued owner message (`interrupt`). The SDK types say `interrupt()` returns
  the stamped messages that will still run.
