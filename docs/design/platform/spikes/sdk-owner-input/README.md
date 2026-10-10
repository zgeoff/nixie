# Spike: owner messages into a running task

This spike sends an owner message into an Agent SDK session while the model works through a task,
once for each value of `SDKUserMessage.priority`, and records when the model reads it.

- SDK: `@anthropic-ai/claude-agent-sdk` 0.3.292, which runs its bundled Claude Code 2.1.292
- Models: `claude-haiku-4-5-20251001` on the subscription, and `glm-5.3` through Z.ai's
  Anthropic-compatible endpoint
- Options: `settingSources: []`, `permissionMode: 'default'`, `allowedTools: ['Bash']`,
  `permissionPrompts: 'none'`, and an `env` that passes only `PATH`, `HOME`, and the model's
  credential

## Question

With streaming input, an owner sends a message mid-task with each priority the SDK offers: `next`,
`later`, `now`, and `now` with `origin: { kind: 'human' }`. When does each one reach the model?

## Run it

Run each command from this directory. [provider.ts](provider.ts) picks the model: Haiku by default,
or GLM 5.3 when `NIXIE_SPIKE_PROVIDER` is `glm`.

```bash
bun install
# The model token, from the vault. Run `unset CLAUDE_CODE_OAUTH_TOKEN` when you finish.
export CLAUDE_CODE_OAUTH_TOKEN=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../../../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/claude-code-oauth-token/credential'
)
env -u ANTHROPIC_API_KEY bun --no-env-file owner.ts next --step 20
env -u ANTHROPIC_API_KEY bun --no-env-file owner.ts later
env -u ANTHROPIC_API_KEY bun --no-env-file owner.ts now --step 20
env -u ANTHROPIC_API_KEY bun --no-env-file owner.ts now --human --step 20
# GLM 5.3: the Z.ai key from the vault, then any command above or below without the Claude token
export NIXIE_SPIKE_PROVIDER=glm ZAI_API_KEY=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../../../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/zai-api-key/credential'
)
env -u ANTHROPIC_API_KEY -u CLAUDE_CODE_OAUTH_TOKEN bun --no-env-file owner.ts next --step 20
unset NIXIE_SPIKE_PROVIDER ZAI_API_KEY
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

## More cases

[cases.ts](cases.ts) holds the cases below. Each ran twice, and the log marks whether a reply holds
PINEAPPLE. Run each command from this directory:

```bash
env -u ANTHROPIC_API_KEY bun --no-env-file cases.ts text
env -u ANTHROPIC_API_KEY bun --no-env-file cases.ts text --human
env -u ANTHROPIC_API_KEY bun --no-env-file cases.ts slow-tool
env -u ANTHROPIC_API_KEY bun --no-env-file owner.ts none --step 20
env -u ANTHROPIC_API_KEY bun --no-env-file cases.ts defer
env -u ANTHROPIC_API_KEY bun --no-env-file cases.ts interrupt
```

- **`now` while the model writes text** (`text`). Claude Code cuts the reply at once, with
  `stop_reason: null`, and a new turn reads the message about 1.4 s after the send. With a `human`
  origin the new reply held PINEAPPLE in both runs. Without one it held PINEAPPLE in 1 run, and in
  the other the model refused "instructions embedded in system reminders".
- **`now` from a human during a slow in-process tool** (`slow-tool`). Claude Code moved the MCP tool
  to the background at the send, although the SDK types name only WebFetch and WebSearch. In both
  runs the model then called the message "an injected instruction" and ignored it.
- **No `priority` field** (`owner.ts none`). It behaves as `next`: the model reads it after the
  running command, and the turn goes on. In both runs the model put PINEAPPLE in its final reply,
  not the next one.
- **`shouldQuery: false`** (`defer`). The message emits an empty `result` with no model call, and
  joins the transcript. The next message's turn sees it: asked for the secret word, the model
  answered PINEAPPLE.
- **`interrupt()` with a queued `next` message** (`interrupt`). `interrupt()` returns the owner
  message's `uuid` in `still_queued`. The running Bash call ends as a rejected tool use, the turn
  ends with `error_during_execution`, and the queued message starts a new turn that holds PINEAPPLE
  and runs the task again from its first command.

The `text` case:

```text
 3.5s OWNER SENDS {"priority":"now"} after 534 streamed chars
 3.5s result #1 success stop_reason=null "# The Last Light ..."
 4.9s OWNER MESSAGE CONSUMED by this assistant message
12.5s assistant (3326 chars) pineapple=true "# The Last Light ..."
```

The `interrupt` case:

```text
6.4s interrupt receipt {"still_queued":["20ac9be8-..."]} owner=20ac9be8
6.4s tool_result (is_error) "The user doesn't want to proceed with this tool use. ..."
7.9s assistant (129 chars) pineapple=true "I'll include PINEAPPLE as requested, then proceed ..."
```

The design's default holds: `next` for a message into a running task, and an interrupt control that
ends the turn so the message starts the next one. `next` reached the model at every tool boundary
and was never refused. Every refusal came on a `now` path, where Claude Code wraps the message in a
system reminder or a tool result.

## GLM 5.3

All 10 cases ran once on GLM 5.3. Claude Code handled every message the same way it did for Haiku,
because the delivery happens in Claude Code before the request leaves:

- `next` and no `priority` reached the model after the running command, and the turn went on.
- `later` started a second turn after the `result`.
- `now` waited for the tool boundary and ended the turn there.
- `now` with a `human` origin moved the Bash command, and the slow MCP tool, to the background.
- `now` cut a text reply at once, `shouldQuery: false` joined the transcript without a model call,
  and `interrupt()` kept the queued message for a new turn.

The model differs in 2 ways:

- GLM followed every message, on every path. Each reply that read the message held PINEAPPLE,
  including the `now` text runs and the slow tool, where Haiku refused it.
- GLM is slower. Each tool turn took about 5 s against about 1 to 2 s for Haiku, so the `interrupt`
  case reached its 120 s cap during the last command, after the queued message had run.

```text
 9.1s OWNER SENDS {"origin":{"kind":"human"},"priority":"now"} after 0 streamed chars
 9.1s tool_result [{"type":"text","text":"MCP tool \"spike/slow_wait\" was moved to the background ...
15.3s OWNER MESSAGE CONSUMED by this assistant message
15.5s assistant (139 chars) pineapple=true "PINEAPPLE — acknowledged, Owner. The slow_wait call ..."
```

The client default holds on GLM as well.

## Untested

- Why Haiku refuses a `now` message, and whether a different wording or a newer model stops it.
  These runs used one test sentence.
- More than one GLM run per case.
