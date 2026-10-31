# Spike results: the sandbox under load

This spike runs Agent SDK turns inside one imp, with nixie's options and stub tools on the host over
HTTP MCP. One long turn has its model secret replaced 5 times while it runs, and one turn asks the
model for 2 batches of 3 parallel tool calls. Each sentence that states a fact ends with a tag:
[measured] for what a run showed, [read in the code] for what the code holds, and [from a record]
for what an existing doc holds.

## Question

1. Does a long turn survive a token rotation mid-turn under imp's broker? The answer informs whether
   the sandbox adapter needs to handle a rotation itself.
2. Do parallel tool calls over HTTP MCP work? The answer informs whether the sandbox adapter can let
   the model call tools in parallel.

## Setup

| Component                      | Version                                |
| ------------------------------ | -------------------------------------- |
| Claude Agent SDK               | 0.3.306                                |
| Claude Code                    | 2.1.306, from the SDK's native package |
| `@modelcontextprotocol/server` | 2.4.0                                  |
| Bun                            | 1.4.3, on the host and in the guest    |
| impd                           | 6.3.2                                  |
| imp CLI                        | 4.1.0                                  |
| Guest image                    | impd's `base` image, Ubuntu 24.04      |
| Model                          | `claude-haiku-5-5`                     |

### The scripts

[`turn.ts`](turn.ts) runs one `query()` inside the imp with the options that nixie's conversation
guest sets: `tools: []`, `allowedTools: ['mcp__nixie']`, `permissionMode: 'dontAsk'`,
`settingSources: []`, `strictMcpConfig`, and the broker's proxy and CA variables passed by name. It
prints one JSON line per event: init, the start and stop of each streamed response, each assistant
message with its tool uses, each tool result, each `api_retry` message and the result.

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
5. It saves `impz audit` for the imp, checks every file it wrote for the token's value, and removes
   the imp and the secret on exit.

A rotation is `impz secret add nixie-spike-load-model ... --replace` with the same binding. In the
rotation turn the model calls `wait` 8 times in sequence, 4 s each, and the tool server forces each
rotation at a fixed call:

| Call | Rotation                                                                                      |
| ---: | --------------------------------------------------------------------------------------------- |
|    2 | the same valid value, 300 ms after the call's result, while the next model request runs       |
|    4 | a junk value, a probe of `GET /v1/models` through the broker, the valid value, a second probe |
|    6 | a junk value during the call's wait, then the valid value `SPIKE_RESTORE_MS` after its result |

### Run steps

1. Install the package and its guest lock: `bun install` at the repo root.
2. Save the imp host that the run may use with `impz login`, and make it the current host.
3. Run the spike with the model token and a scratch directory. The script refuses to start when the
   imp or the secret exists.

   ```bash
   cd research/sandbox-under-load
   export SPIKE_WORK=<scratch_dir>
   CLAUDE_CODE_OAUTH_TOKEN=$(op read 'op://nixie/claude-code-oauth-token/credential') bun run spike
   bun run summary
   ```

   Expect: `token check: clean` as the last line. Results land in `results/`, which git ignores.

4. Remove the scratch directory: `rm -rf <scratch_dir>`.

The recorded runs are run 1 with the restore 4 s after the result, and run 2 with the default 1000
ms. Run 1 also placed its call-2 rotation during the tool's wait, before the fix that delays it past
the result. Both runs together cost $0.0022 by the CLI's own count.

## Answer

### 1. A token rotation mid-turn

A replace whose new value is valid never breaks the turn. In run 2, the call-2 rotation ran from
15096 ms to 15241 ms after `query()`, and the broker's audit puts the model request it overlapped
between about 14883 ms and 16501 ms; that request returned 200 [measured]. The call-4 rotations
stored a junk value and then the valid one between model requests, and the turn's next request
returned 200 [measured]. In run 1, the same-value rotation landed during the tool's wait, and the
turn went on [measured].

The broker reads the secret's value per request. The probe after the junk value got 401 and the
probe after the valid one got 200, each within 0.6 s of the replace [measured]. The CLI's own first
model request after the call-6 junk value got 401 too [measured].

A model request that meets a refused value ends the turn within about 2 s:

| ms after the call-6 result | Run 2                                        | Run 1                   |
| -------------------------: | -------------------------------------------- | ----------------------- |
|                        286 | `api_retry` attempt 1, 401, retry in 576 ms  | the same, at 285        |
|                       1140 | the valid value is back                      | -                       |
|                       1142 | `api_retry` attempt 2, 401, retry in 1046 ms | the same, at 1133       |
|                       2200 | the result: `is_error: true`                 | the same, at 2282       |
|                       4103 | -                                            | the valid value is back |

The CLI sent 2 model requests in that window, and the broker logged a 401 for each [measured]. The
second request left before the valid value came back, and the CLI never sent the retry that attempt
2 announced, although `max_retries` was 10 [measured]. The assistant message carries
`error: 'authentication_failed'`, the result has subtype `success` with `is_error: true` and the
text `Failed to authenticate. API Error: 401 Invalid bearer token`, and `query()` then throws
[measured].

nixie never replaces a model secret in place: a rotated credential gets a new secret under a new
name, and nixie replaces the sandbox at its next start, so a rotation never reaches a running turn
[from a record]. The docs on
[conversation turns](../../docs/architecture/core/conversation-turns.md#the-guest-and-its-sandbox)
and [impd names](../../docs/architecture/deployment/impd-names.md#model-secrets) hold this rule.

So the sandbox adapter needs no rotation handling of its own when it stores each new value only once
that value is valid. A window in which the broker holds a refused value fails any turn whose model
request falls in it, and the CLI never waits it out.

### 2. Parallel tool calls over HTTP MCP

The model sent each batch as 3 `tool_use` blocks under one message ID, in both runs [measured]. The
CLI ran the 3 `wait_read_only` calls at once and the 3 `wait` calls one at a time:

| Tool             | Run | Calls in one message | Most in flight | First start to last end |
| ---------------- | --: | -------------------: | -------------: | ----------------------: |
| `wait_read_only` |   1 |                    3 |              3 |                 3341 ms |
| `wait_read_only` |   2 |                    3 |              3 |                 3418 ms |
| `wait`           |   1 |                    3 |              1 |                 9043 ms |
| `wait`           |   2 |                    3 |              1 |                 9044 ms |

The HTTP MCP route carries parallel calls: one `createMcpHandler` endpoint behind the reverse
forward served 3 `tools/call` requests at once, and each result reached the guest under its own
tool-use ID as its call ended [measured]. The 3 read-only calls started within 418 ms of each other
in run 2 [measured].

nixie's run server lists its tools with no annotations [read in the code], so the CLI runs nixie's
tools one at a time, whatever the model asks for. The sandbox adapter can let the model call tools
in parallel; a call runs in parallel only when its tool carries `readOnlyHint: true`.

### The model credential

The broker kept the token out of the guest: the guest held only the placeholder, and no file the run
wrote held the token's value [measured]. Under egress `none`, the guest reached the model host
through the broker and the tools through the reverse forward [measured].

## Untested

- The order of the 2 batches. The read-only batch always ran first, so the spike did not rule out a
  CLI that runs only a turn's first batch in parallel.
- The credential header that nixie's profiles use. The run sent the OAuth token as
  `CLAUDE_CODE_OAUTH_TOKEN`; nixie's profiles use `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`, and
  the CLI's retries on 401 may differ for those.
- A refused value for less than about 0.8 s, which might fall between the CLI's 2 requests.
- imp's `oauth` secret kind, whose broker refreshes the token itself.
- A rotation during a streamed response after its first byte, a turn longer than 40 s, and more than
  3 calls in one batch.
- A production deployment's own tool server, policy checks and tool results in place of the stubs.
