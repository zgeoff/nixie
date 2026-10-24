# Spike: hold a tool call for an owner decision

This spike compares two ways to pause a tool call in an Agent SDK session until the owner decides: a
mod's `tool.call` hook that waits inside the running process, and a `PreToolUse` hook that returns
`defer`, which ends the process and resumes the session later. Decision
[0002](../../docs/decisions/0002-approvals.md) rejects both for approvals on these findings.

## Question

Can a `tool.call` hook hold a call while it waits for an outside decision that arrives after 30 s, 2
min or 6 min, and what happens at the hook's time limit? Does a `PreToolUse` `defer` work through
the SDK, survive the end of the process and resume in a new one, and does it refuse a parallel batch
of tool calls?

## Answer

- A mod hook holds a call for 6 min when it waits in repeated long-polls through `$.http.fetch`. One
  `$.http.fetch` call aborts at 30 s, so a single long-poll fails and the call runs.
- The hook's own time limit is 10 s, and time inside `next` and mods API calls does not count. At
  the limit, Claude Code skips the hook and the call runs, unless the hook has a `.catch` handler.
- A mod hold does not survive the end of the process: on resume, the model reads a synthetic result
  that marks the outcome as unknown.
- `defer` works through the SDK, and the deferred call resumes in a new process with `resume`.
- `defer` does not refuse a parallel batch in this build: both calls defer, the result names only
  the last one, and the other call's `tool_use` never gets a result.

Use neither for approvals: a mod hold dies with its process, and `defer` blocks the session and
loses calls in a parallel batch.

## Run it

```bash
bun install
env -u ANTHROPIC_API_KEY bun --no-env-file hold.ts mods/nixie-hold-poll 360 47843 --poll --debug-file /tmp/poll.log
env -u ANTHROPIC_API_KEY bun --no-env-file defer.ts start /tmp/session.txt
env -u ANTHROPIC_API_KEY bun --no-env-file defer.ts resume /tmp/session.txt allow
```

Each command needs the model token in `CLAUDE_CODE_OAUTH_TOKEN`. The [setup](results.md#setup) gives
the versions, the options, the token command and every hold and defer run.

## Results

The [results](results.md) hold the logs and the table of each mod hold, the defer and resume runs,
and the parallel batch.

## Untested

`$.ui.ask` as a hold, a defer from a mod, and a hold on a subagent's tool call. The
[untested list](results.md#untested) gives the rest.
