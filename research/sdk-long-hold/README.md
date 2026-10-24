# Spike: hold a tool call for an owner decision

This spike compares two ways to pause a tool call in an Agent SDK session until the owner decides: a
mod's `tool.call` hook that waits inside the running process, and a `PreToolUse` hook that returns
`defer`, which ends the process and resumes the session later.

- SDK: `@anthropic-ai/claude-agent-sdk` 0.3.292, which runs its bundled Claude Code 2.1.292
- Model: `claude-haiku-4-5-20251001`
- Options on every run: `settingSources: []`, `permissionMode: 'default'`, `allowedTools: ['Bash']`,
  `permissionPrompts: 'none'`, and an `env` that passes only `PATH`, `HOME`, the OAuth token, and
  `NIXIE_DECIDER_URL`

## Questions

1. Can a `tool.call` hook hold a call while it waits for an outside decision that arrives after 30
   s, 2 min, or 6 min? What is the hook's time limit, and what happens when a hook reaches it?
2. Does a `PreToolUse` `defer` work through the SDK? Does the deferred call survive the end of the
   process and resume in a new one? Does `defer` refuse a parallel batch of tool calls, as the hooks
   docs say?

## Run it

Run each command from this directory. `hold.ts` starts a local decision service that plays the
owner: it refuses the call once the delay has passed since its first request. Claude Code writes
type declarations and a `tsconfig.json` into each mod directory when it loads the mod, and
`.gitignore` keeps them out of the repo.

```bash
bun install
# The model token, from the vault. Run `unset CLAUDE_CODE_OAUTH_TOKEN` when you finish.
export CLAUDE_CODE_OAUTH_TOKEN=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/claude-code-oauth-token/credential'
)
# A hold on a timer of the hook's own, without and with .catch
env -u ANTHROPIC_API_KEY bun --no-env-file hold.ts mods/nixie-hold-promise 0 47831 --debug-file /tmp/promise.log
env -u ANTHROPIC_API_KEY bun --no-env-file hold.ts mods/nixie-hold-promise-catch 0 47832 --debug-file /tmp/promise-catch.log
# A hold on one long-poll through $.http.fetch
env -u ANTHROPIC_API_KEY bun --no-env-file hold.ts mods/nixie-hold-http 45 47833 --debug-file /tmp/http.log
# A hold on repeated long-polls, for 30, 120, and 360 seconds
env -u ANTHROPIC_API_KEY bun --no-env-file hold.ts mods/nixie-hold-poll 360 47843 --poll --debug-file /tmp/poll.log
# Defer, then resume in new processes
env -u ANTHROPIC_API_KEY bun --no-env-file defer.ts start /tmp/session.txt
env -u ANTHROPIC_API_KEY bun --no-env-file defer.ts resume /tmp/session.txt defer
env -u ANTHROPIC_API_KEY bun --no-env-file defer.ts resume /tmp/session.txt allow
# Defer a parallel batch
env -u ANTHROPIC_API_KEY bun --no-env-file defer.ts batch /tmp/batch.txt
# Write Claude Code's debug log for a defer run
NIXIE_DEBUG_FILE=/tmp/defer.log env -u ANTHROPIC_API_KEY bun --no-env-file defer.ts batch /tmp/batch.txt
# Resume a session whose process was killed during a hold
env -u ANTHROPIC_API_KEY bun --no-env-file resume.ts <session_id> "What happened to the Bash command you ran?"
```

## Answers

- A mod hook holds a call for 6 min when it waits in repeated long-polls through `$.http.fetch`. The
  spike finds no limit on the hold up to 6 min.
- The hook's own time limit is 10 s. Time inside `next` and inside mods API calls does not count,
  but a promise of the hook's own does. At the limit, Claude Code skips the hook and the call runs,
  unless the hook has a `.catch` handler.
- One `$.http.fetch` call aborts at 30 s. A hook that waits on a single long-poll fails at 30 s, and
  the call runs.
- `defer` works through the SDK, and the deferred call resumes in a new process with `resume`. The
  result carries `stop_reason: "tool_deferred"` and `deferred_tool_use`.
- A mod hold does not survive the end of the process. On resume, the model reads a synthetic result
  that marks the outcome as unknown.
- `defer` does not refuse a parallel batch in this build. Both calls defer, the result names only
  the last one, and the other call's `tool_use` never gets a result.

### Mod hold: the time limit

`nixie-hold-promise` waits 15 s on `setTimeout` and then denies. `next.budget` reads
`{"ms":10000,"remainingMs":9999}` when the hook starts. At 10 s, Claude Code skips the hook and the
command runs:

```text
05:25:15.780Z [nixie-hold-promise] $.ui.log (to debug): nixie hold start budget={"ms":10000,"remainingMs":9999}
05:25:25.781Z [ERROR] nixie-hold-promise: tool.call hook skipped: ran past its 10s budget
05:25:25.959Z Spawning shell without login (-l flag skipped)
```

With a `.catch` handler, the same timeout denies the call. `next.error.kind` is `timeout` and
`next.error.message` is `undefined`, so the model reads
`nixie policy failed (timeout: undefined), so the command did not run.`

### Mod hold: one long-poll

`nixie-hold-http` waits on one `$.http.fetch` to the decision service. With owner delays of 30 s, 45
s, 2 min, and 6 min, the fetch aborts at 30 s in every run and the hook throws. Claude Code skips
the hook and the command runs. This log comes from the 45 s run:

```text
[nixie-hold-http] nixie fetch failed after 30002 ms: nixie-hold-http: $.http.fetch(http://127.0.0.1:47861/decide?tool_use_id=toolu_…) aborted: no complete answer within 30000ms
[ERROR] nixie-hold-http: tool.call hook skipped: threw nixie-hold-http: $.http.fetch(...) aborted: no c...
```

The 30 s cap applies to `$.http.fetch` itself, and `HttpInit` takes no timeout option. The mods
reference documents the 30 s default only for `$.process.run`, which accepts `timeoutMs` up to 10
min.

### Mod hold: repeated long-polls

`nixie-hold-poll` loops on `$.http.fetch`. The decision service returns `pending` after 20 s, so
each request stays under the fetch cap, and the hook stops once the owner refuses. The hook also has
a `.catch` handler that denies on failure.

| Owner answers after | Polls | The model reads                                                |
| ------------------- | ----- | -------------------------------------------------------------- |
| 30 s                | 2     | `the owner refused this command after 30004 ms and 2 polls.`   |
| 2 min               | 6     | `the owner refused this command after 120004 ms and 6 polls.`  |
| 6 min               | 18    | `the owner refused this command after 360004 ms and 18 polls.` |

`next.budget.remainingMs` reads 9,996 to 9,999 ms after every poll, so the time spent inside
`$.http.fetch` does not count against the limit. The tool call stays pending for the whole hold, and
the SDK stream shows nothing between the `tool_use` and the `tool_result`.

### Mod hold: the process ends

A poll hold with a 5 min owner delay is killed with `SIGKILL` 15 s into the hold. A new process
resumes the session with a question. The resumed transcript holds a result that Claude Code wrote
for the dangling call, and the command never runs:

```text
assistant tool_use {'command': 'echo held MARK_HOLD'}
user tool_result [Tool call interrupted: the session ended before this call's result was recorded, so its outcome is unknown. Check whether it took effect before relying on it ...
```

### Defer and resume

`defer.ts` passes an SDK `hooks.PreToolUse` callback that returns `permissionDecision: 'defer'`. The
process ends at once:

```text
2.4s tool_use toolu_…MT97 {"command":"echo deferred-call-ran"}
2.4s PreToolUse toolu_…MT97 -> defer
2.4s result success stop_reason=tool_deferred terminal_reason=tool_deferred
2.4s deferred_tool_use {"id":"toolu_…MT97","name":"Bash","input":{"command":"echo deferred-call-ran", ...}}
3.2s process done
```

A new process with `resume: <session_id>` fires `PreToolUse` again for the same `tool_use_id`.
Returning `defer` again ends that process the same way. Returning `allow` runs the command, and The
model finishes the turn. Returning `deny` gives the model an error result, and the turn goes on.

Pass a streaming prompt that sends nothing and stays open until the first result. Two other prompt
shapes break the resume:

- `prompt: ''` sends an empty user message after the deferred call resolves, so the model starts a
  second turn and makes a new tool call.
- An input stream that ends at once closes the channel that carries hook callbacks. Claude Code
  resolves the deferred call without the hook, as
  `The user doesn't want to take this action right now. STOP what you are doing and wait for the user to tell you how to proceed.`

Defer leaves nothing in memory, so the end of the process is part of the design. The session file in
`~/.claude/projects/` holds the pending call until `cleanupPeriodDays` removes it.

### Defer a parallel batch

The hooks docs say `defer` works only for a single tool call, and that in a batch Claude Code
ignores it with a warning and runs the tools. In two runs of this build, the model makes both calls
in one API message, and both defer:

```text
2.7s tool_use toolu_…pVLZ {"command":"echo batch-one-ran"}
2.7s PreToolUse toolu_…pVLZ -> defer
3.0s tool_use toolu_…4ApC {"command":"echo batch-two-ran"}
3.0s PreToolUse toolu_…4ApC -> defer
3.0s result success stop_reason=tool_deferred terminal_reason=tool_deferred
3.0s deferred_tool_use {"id":"toolu_…4ApC", ...}
```

The debug log has no warning. On resume with `allow`, only the second call runs. The transcript
keeps the first `tool_use` with no `tool_result`, Claude Code adds
`Continue from where you left off.`, and the model issues the first command again under a new id. An
adapter that defers a batch sees only its last call in `deferred_tool_use`. The other calls run only
if the model issues them again after the resume, each with a new id and a new `PreToolUse` check.

## Untested

- `$.ui.ask` as a hold. The events docs say it rejects in a `claude -p` run, and the SDK runs Claude
  Code that way.
- `$.process.run` with `timeoutMs` as a hold of up to 10 min in one call.
- A defer from a mod. The mods events have no `defer` result; a mod would have to return it from a
  `classic.PreToolUse` hook.
- A hold or a defer on a tool call that a subagent makes.
- The 1 s limit on a `.catch` handler.
