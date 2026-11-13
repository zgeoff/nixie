# Spike: a nixie turn through `codex app-server`

This spike drives tool-using turns through `codex app-server` against a mock MCP server and a local
stand-in for the model gateway. Its answers set the Codex guest's requests, its config and the
capabilities the `codex` harness declares ([GEO-2236](https://linear.app/zgeoff/issue/GEO-2236)).

## Question

Which app-server methods, parameters and notifications does a nixie turn use? Does Codex report
usage for each model call, and send a tool-call ID in `_meta`? Can a model call bypass the model
gateway over a websocket? Can a resume or a fork cut a thread at a chosen turn? With a ChatGPT plan
login, does the CLI refresh its own token? Should the Codex guest use app-server or
`codex exec --json`?

## Answer

- Use `codex app-server`. It covers all 12 harness capabilities, with the turn limit counted by the
  guest; `codex exec --json` gives no usage for each model call.
- A turn is `thread/start`, then `turn/start` with `threadId` and `input`, then `turn/completed`.
  `turn/interrupt` takes `threadId` and `turnId`, and `turn/steer` takes `expectedTurnId`.
- `thread/tokenUsage/updated` arrives once for each model call, with `tokenUsage.last` equal to the
  model API's usage on all 14 calls. It also repeats a stored figure after a resume, a fork and a
  compaction. An event is a new call only when its turn started in this process and its `total`
  grows by its `last`.
- Codex sends `_meta.callId` on each `tools/call`, equal to the app-server item ID of that call.
- With `supports_websockets = true`, Codex tried a websocket first; with `false`, it sent HTTP only.
- `tool_output_token_limit` is a top-level key: strict config refuses it under
  `[mcp_servers.nixie]`.
- `thread/fork` with `lastTurnId` cuts a thread after a chosen turn. `thread/resume` takes no turn
  to cut at, and loads the whole thread.
- With a ChatGPT plan login in its own mode, the CLI refreshes the token itself when the access
  token is 5 minutes from expiry or the model API answers 401 twice. In external mode
  (`chatgptAuthTokens`), it asks the client for a new token and never refreshes one itself.

The [verdict](results.md#verdict) lists what the Codex guest needs from this spike, and what would
change the pick.

## Run it

Install Codex CLI 0.166.0 first: `run.ts` refuses any other version. Then run from this directory,
with an OpenAI API key in the environment.

```bash
bun install
OPENAI_API_KEY=<api_key> bun run.ts <run_name> gpt-6-luna
```

Expect 1 line per turn, ending `supports_websockets = true: completed`, and the logs in
`runs/<run_name>/`. The [setup](results.md#setup) gives the versions, the steps and the cost.

## Results

The [results](results.md) give each answer with the command over [`runs/luna-low/`](runs/luna-low/)
and its output, and the [capability table](results.md#capabilities).

## Untested

`thread/revert`, the built-in `openai` provider, automatic compaction, failed model calls, a plan
login against the real ChatGPT backend, and Codex inside an imp sandbox. The
[untested list](results.md#untested) gives the rest.
