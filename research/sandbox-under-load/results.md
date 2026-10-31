# Spike results: the sandbox under load

This spike runs Agent SDK turns inside one imp, a microVM that impd runs and the `impz` CLI drives.
The model token reaches the API through impd's broker, a proxy that adds a stored secret to the
imp's requests, so the guest never holds the token. nixie's stub tools serve from the host over the
Model Context Protocol (MCP) on HTTP.

A rotation, in this spike, is `impz secret add <name> ... --replace` with the same host and header:
impd keeps the secret and its grants, and swaps its value. One long turn meets 5 rotations while it
runs, and one turn asks the model for 2 batches of 3 parallel tool calls. Each sentence that states
a fact ends with a tag: [measured] for what a run showed, [read in the code] for what nixie's code
holds, and [from a record] for what an existing doc holds.

## Question

1. Does a long turn survive a token rotation mid-turn under imp's broker? The answer informs whether
   the sandbox adapter needs to handle a rotation itself.
2. Do parallel tool calls over HTTP MCP work? The answer informs whether the sandbox adapter can let
   the model call tools in parallel.

## Answer

### 1. A token rotation mid-turn

A turn survives any rotation to a valid value, whether a model request is in flight or not, because
the broker reads the secret's value per request [measured]. A model request that meets a refused
value ends the turn about 2 s later, and Claude Code, the CLI that the SDK starts, never waits for a
valid value to come back [measured].

nixie never rotates a model secret in place: a rotated credential gets a new secret under a new
name, and nixie replaces the sandbox at its next start, so a rotation never reaches a running turn
[from a record]. The docs on
[conversation turns](../../docs/architecture/core/conversation-turns.md#the-guest-and-its-sandbox)
and [impd names](../../docs/architecture/deployment/impd-names.md#model-secrets) hold this rule. The
sandbox adapter needs no rotation handling of its own for that path, and none for an in-place
rotation whose new value is valid when nixie stores it.

#### Rotations to a valid value

In run 2, the call-2 rotation ran from 15096 ms to 15241 ms after `query()` [measured]. The broker's
audit puts the model request it overlapped between about 14883 ms and 16501 ms, and that request
returned 200 [measured]. The call-4 rotations stored a junk value and then the valid one between
model requests, and the turn's next request returned 200 [measured]. In run 1, the call-2 rotation
landed during the tool's wait, and the turn went on [measured].

The broker reads the value per request. The probe after the junk value got 401 and the probe after
the valid one got 200, each within 0.6 s of its rotation [measured]. The CLI's own first model
request after the call-6 junk value got 401 too [measured].

#### A refused value at a model request

Times count from the call-6 result, when the CLI sends its next model request:

| Event                                                  |  Run 2 ms |  Run 1 ms |
| ------------------------------------------------------ | --------: | --------: |
| `api_retry` attempt 1, status 401                      |       286 |       285 |
| the CLI's second request leaves, by the broker's audit | about 920 | about 915 |
| the rotation back to the valid value ends              |      1140 |      4103 |
| `api_retry` attempt 2, status 401                      |      1142 |      1133 |
| the result, with `is_error: true`                      |      2200 |      2282 |

In both runs, the broker logged exactly 2 model requests in that window, each with 401 [measured].
In run 2, the second request left about 220 ms before the rotation back ended, so it met the junk
value too [measured]. Attempt 2 announced a retry in 1046 ms and `max_retries` of 10, and the CLI
sent no further request [measured]. The assistant message carries `error: 'authentication_failed'`,
the result has subtype `success` with `is_error: true` and the text
`Failed to authenticate. API Error: 401 Invalid bearer token`, and `query()` then throws [measured].

### 2. Parallel tool calls over HTTP MCP

Parallel tool calls work over HTTP MCP, and the CLI runs a batch in parallel only when its tool
carries `readOnlyHint: true` [measured]. nixie's run server lists its tools with no annotations, so
the CLI runs nixie's tools one at a time, whatever the model asks for [read in the code]. The
sandbox adapter can let the model call tools in parallel, and a batch runs in parallel once its
tools carry the hint.

The model sent each batch as 3 `tool_use` blocks under one message ID, in both runs [measured]:

| Tool             | Run | Calls in one message | Most in flight | First start to last end |
| ---------------- | --: | -------------------: | -------------: | ----------------------: |
| `wait_read_only` |   1 |                    3 |              3 |                 3341 ms |
| `wait_read_only` |   2 |                    3 |              3 |                 3418 ms |
| `wait`           |   1 |                    3 |              1 |                 9043 ms |
| `wait`           |   2 |                    3 |              1 |                 9044 ms |

One `createMcpHandler` endpoint behind the reverse forward served 3 `tools/call` requests at once,
and each result reached the guest under its own tool-use ID as its call ended [measured]. The 3
read-only calls started within 418 ms of each other in run 2 [measured].

### The model credential

The guest held only the placeholder token, and no file the run wrote held the token's value
[measured]. Under egress `none`, the guest reached the model host through the broker and the tools
through the reverse forward [measured].

## Setup

| Component                      | Version                                |
| ------------------------------ | -------------------------------------- |
| Claude Agent SDK               | 0.3.306                                |
| Claude Code                    | 2.1.306, from the SDK's native package |
| `@modelcontextprotocol/server` | 2.4.0                                  |
| Bun                            | 1.4.3, on the host and in the guest    |
| impd                           | 6.3.2                                  |
| `impz`                         | 4.1.0                                  |
| Guest image                    | impd's `base` image, Ubuntu 24.04      |
| Model                          | `claude-haiku-5-5`                     |

### The scripts

[`turn.ts`](turn.ts) runs one `query()` inside the imp with the options that nixie's conversation
guest sets: `tools: []`, `allowedTools: ['mcp__nixie']`, `permissionMode: 'dontAsk'`,
`settingSources: []`, `strictMcpConfig`, and the broker's proxy and certificate variables passed by
name. It prints one JSON line per event: init, the start and stop of each streamed response, each
assistant message with its tool uses, each tool result, each `api_retry` message and the result.

[`create-tool-server.ts`](create-tool-server.ts) builds the MCP server that `createMcpHandler`
serves, a low-level `Server` like nixie's run server. It lists 2 tools that wait for the given
seconds: `wait`, with no annotations, as nixie lists its tools, and `wait_read_only`, with
`readOnlyHint: true`. It logs the start and end of each `tools/call` with the model's tool-use ID
and the number of calls in flight.

[`run.ts`](run.ts) drives the run from the host, and stamps every line on the host's clock as it
arrives:

1. It creates the imp `nixie-spike-load` on the current saved imp host, copies in Bun and the
   package, installs it, and sets egress `none`.
2. It stores the model token as the `custom` secret `nixie-spike-load-model` for
   `api.anthropic.com`, as an `authorization: Bearer` header, and grants it to the imp. The guest
   holds only a placeholder in `CLAUDE_CODE_OAUTH_TOKEN`.
3. It serves the tools on the host's loopback and opens `impz proxy --reverse`, so the guest reaches
   them at `http://127.0.0.1:8901/mcp`.
4. It runs the rotation turn, then the parallel turn, each through `impz exec --require broker`.
5. It saves `impz audit` for the imp, and checks every file it wrote for the token's value.
6. It removes the imp and the secret on exit, on a failed step, and on `SIGINT` or `SIGTERM`. A
   failed guest command fails the run.

In the rotation turn the model calls `wait` 8 times in sequence, 4 s each, and the tool server
starts each rotation at a fixed call:

| Call | Value           | When                                       |
| ---: | --------------- | ------------------------------------------ |
|    2 | the valid value | 300 ms after the call's result             |
|    4 | a junk value    | at the call's start, then a broker probe   |
|    4 | the valid value | after that probe, then a second probe      |
|    6 | a junk value    | at the call's start                        |
|    6 | the valid value | `SPIKE_RESTORE_MS` after the call's result |

A broker probe is a `GET /v1/models` request from the guest through the broker. The CLI sends its
next model request as soon as a call's result arrives, so the call-2 rotation lands while that
request is in flight.

### Run steps

1. Install the packages at the repo root: `bun install`.
2. Save the imp host that the run may use, and make it the current host: `impz login`.
3. Go to the spike's folder: `cd research/sandbox-under-load`.
4. Set a scratch directory: `export SPIKE_WORK=<scratch_dir>`.
5. Run the spike with the model token. The script refuses to start when its imp or its secret
   exists.

   ```bash
   CLAUDE_CODE_OAUTH_TOKEN=$(op read 'op://nixie/claude-code-oauth-token/credential') bun run spike
   ```

   Expect: `token check: clean` as the last line, and no imp or secret named `nixie-spike-load` left
   in `impz ls` and `impz secret ls`. Results land in `results/`, which git ignores.

6. Print the tables from the results: `bun run summary`. Expect: a timeline of the rotation turn,
   then the parallel calls table.
7. Remove the scratch directory: `rm -rf <scratch_dir>`.

Run 1 set `SPIKE_RESTORE_MS=4000`, and ran its call-2 rotation 300 ms after the call's start, during
the tool's wait. Run 2 used the script as it stands, with the default 1000 ms. Both runs together
cost $0.0022 by the CLI's own count.

## Untested

- The order of the 2 batches. The read-only batch always ran first, so the spike did not rule out a
  CLI that runs only a turn's first batch in parallel.
- The credential variables that nixie's profiles use. The run sent the OAuth token as
  `CLAUDE_CODE_OAUTH_TOKEN`; nixie's profiles use `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`, and
  the CLI's retries on 401 may differ for those.
- A refused value shorter than the 0.9 s between the CLI's 2 requests, which might fall between
  them.
- imp's `oauth` secret kind, which impd refreshes itself.
- A rotation during a streamed response after its first byte, a turn longer than 40 s, and more than
  3 calls in one batch.
- A production deployment's own tool server, policy checks and tool results in place of the stubs.
