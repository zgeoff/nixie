# Spike results: a nixie turn through `codex app-server`

This spike drives nixie-shaped turns through `codex app-server` over stdio JSON-RPC, against a mock
MCP server named `nixie` and a local stand-in for the counting proxy. This report gives the methods
and notifications a Codex guest uses, and the harness capabilities that guest can declare. Every
answer below ends each fact with its source: [measured] for a fact this spike ran and saw, [read in
the code] for a fact read in Codex's generated protocol or in this repo, and [from a record] for a
fact an earlier doc or spike holds.

## Setup

| Component    | Version                                         |
| ------------ | ----------------------------------------------- |
| Codex CLI    | `codex-cli 0.166.0`; `run.ts` refuses any other |
| Bun          | 1.4.3                                           |
| Model        | `gpt-6-luna`, reasoning effort `low`            |
| Model API    | OpenAI Responses API, through `/v1/responses`   |
| MCP protocol | `2025-06-18`, as Codex's client offered it      |

[`run.ts`](run.ts) gives each Codex process its own `CODEX_HOME`, `HOME` and working directory under
`.state/`, which git ignores, with a read-only sandbox and the clean config of the
[model-eval spike](../model-eval/codex-converse.ts). The config points a custom model provider at
[`start-count-proxy.ts`](start-count-proxy.ts), which forwards HTTP to the OpenAI API and refuses a
websocket upgrade with 426. [`start-tool-server.ts`](start-tool-server.ts) serves one tool,
`find_note`, and logs each JSON-RPC message before the MCP SDK parses it. A `find_note` call for the
topic `slow` waits 8 seconds, so the script can steer or interrupt while the call is open.

The script makes 3 app-server processes in turn:

1. The first process starts a thread and runs 5 turns: 2 tool calls, a structured reply, a steer, an
   interrupt and an image. It then compacts the thread.
2. The second process resumes that thread by its ID, and forks it after its first turn.
3. The third process sets `supports_websockets = true` on the provider and runs 1 turn.

The logs in [`runs/luna-low/`](runs/luna-low/) hold every message in both directions, with the state
path, home path, host name and MCP token replaced by placeholders. The 13 model calls read 40,325
input tokens, 27,488 of them from the cache, and wrote 589 output tokens [measured]. Run each
command below from `runs/luna-low/`.

## Method and parameter names

Decision it informs: the requests and fields the Codex guest sends for a turn.

The client sends `initialize` with `clientInfo` and `capabilities`, then the notification
`initialized` [measured]. The table gives the requests a nixie turn uses, from
`codex app-server generate-ts --out <dir>` [read in the code]. Each row except `thread/revert`
answered without an error in the first or second process [measured].

| Request                | Parameters a turn uses                              | Result                   |
| ---------------------- | --------------------------------------------------- | ------------------------ |
| `thread/start`         | `model`, `cwd`, `baseInstructions`                  | `thread.id`              |
| `turn/start`           | `threadId`, `input`, and `outputSchema` when needed | `turn.id`                |
| `turn/steer`           | `threadId`, `expectedTurnId`, `input`               | none read                |
| `turn/interrupt`       | `threadId`, `turnId`                                | none read                |
| `thread/resume`        | `threadId`                                          | `thread`                 |
| `thread/fork`          | `threadId`, `lastTurnId`                            | `thread.id`, a new ID    |
| `thread/compact/start` | `threadId`                                          | none read                |
| `thread/revert`        | `threadId`, `beforeTurnId`                          | not called by this spike |

`input` is a list of `UserInput` items: `{ type: 'text', text, text_elements: [] }`, or
`{ type: 'localImage', path }` for an image file [read in the code]. A turn ends with the
notification `turn/completed`, whose `turn.status` is `completed`, `interrupted`, `failed` or
`inProgress` [read in the code]. The reply text arrives in `item/completed` notifications whose
`item.type` is `agentMessage` [measured].

Compaction runs as a turn of its own: the first process saw 6 `turn/started` notifications for 5
turns and a compaction, and the compaction ended with an `item/completed` of type
`contextCompaction` [measured]. The protocol defines a `thread/compacted` notification, but no
process sent one [measured].

```bash
jq '[.[] | select(.method == "turn/started")] | length' rpc-first-process.json
jq -c '[.[] | select(.method) | .method] | map(select(. == "thread/compacted")) | length' rpc-*.json
```

```text
6
0
0
0
```

## Usage for each model call

Decision it informs: whether the Codex guest can send a `call` frame for each model API call, and
how it fills `modelCallUsageSchema`.

`thread/tokenUsage/updated` arrives once for each model call, and its `tokenUsage.last` equals the
usage that the model API's `response.completed` event held for that call [measured]. Each turn saw
as many of these notifications for its own `turnId` as the proxy saw model requests [measured]. The
websocket turn counts 2 proxy requests for 1 model call, because 1 of them is the refused upgrade
[measured].

Codex also sends the notification when no model call happened: once after `thread/resume`, once
after `thread/fork`, and twice around the compaction's own call [measured]. The resume and fork
replays arrive before the new turn's `turn/started`, with the `turnId` of the thread's first turn,
which the second process never started [measured]. The 2 compaction extras keep the compaction's
`turnId`, and their `tokenUsage.total` doesn't grow by `tokenUsage.last` [measured].

A guest that counts a call only when both of these hold gets the proxy's 13 usages, and no others
[measured]:

1. The event's `turnId` names a turn that this process saw in `turn/started`.
2. `total.totalTokens` grows by exactly `last.totalTokens` over the thread's previous event.

A thread with a single call has its `total` equal to its `last`, as the websocket thread's only
event shows [measured]. A replay of such a thread would pass the second condition, so the first
condition is the one that drops it [guess: no step replayed a one-call thread; a resume of the
websocket thread would settle it].

```bash
for f in rpc-first-process.json rpc-second-process.json rpc-websocket-process.json; do
  jq -c 'reduce (.[] | select(.from == "server" and .method != null)) as $m
    ({started: {}, seen: {}, calls: []};
     if $m.method == "turn/started" then .started[$m.params.turn.id] = true
     elif $m.method == "thread/tokenUsage/updated" then
       ($m.params.tokenUsage) as $u
       | (if .started[$m.params.turnId]
            and $u.total.totalTokens - (.seen[$m.params.threadId] // 0) == $u.last.totalTokens
          then .calls += [$u.last.totalTokens] else . end)
       | .seen[$m.params.threadId] = $u.total.totalTokens
     else . end) | .calls[]' "$f"
done | jq -s -c sort
jq -c '[.[] | select(.usage) | .usage.total_tokens] | sort' proxy.json
```

```text
[2763,2792,2932,3026,3090,3091,3111,3164,3177,3241,3292,3440,3706]
[2763,2792,2932,3026,3090,3091,3111,3164,3177,3241,3292,3440,3706]
```

```bash
jq -c '.[] | {step, tokenUsageEvents, rawResponseEvents, proxyCalls}' turns.json
```

```text
{"step":"tool turn","tokenUsageEvents":3,"rawResponseEvents":0,"proxyCalls":3}
{"step":"structured output","tokenUsageEvents":1,"rawResponseEvents":0,"proxyCalls":1}
{"step":"steer","tokenUsageEvents":3,"rawResponseEvents":0,"proxyCalls":3}
{"step":"interrupt","tokenUsageEvents":1,"rawResponseEvents":0,"proxyCalls":1}
{"step":"image","tokenUsageEvents":1,"rawResponseEvents":0,"proxyCalls":1}
{"step":"resume in a new process","tokenUsageEvents":1,"rawResponseEvents":0,"proxyCalls":1}
{"step":"fork after the first turn","tokenUsageEvents":1,"rawResponseEvents":0,"proxyCalls":1}
{"step":"supports_websockets = true","tokenUsageEvents":1,"rawResponseEvents":0,"proxyCalls":2}
```

The first 3 calls, as Codex reported them and as the proxy read them:

```bash
jq -c '[.[] | select(.method == "thread/tokenUsage/updated") | .params.tokenUsage.last][0:3][]' rpc-first-process.json
jq -c '[.[] | select(.usage) | .usage][0:3][]' proxy.json
```

```text
{"totalTokens":2792,"inputTokens":2767,"cachedInputTokens":0,"cacheWriteInputTokens":2764,"outputTokens":25,"reasoningOutputTokens":0}
{"totalTokens":2932,"inputTokens":2884,"cachedInputTokens":2764,"cacheWriteInputTokens":117,"outputTokens":48,"reasoningOutputTokens":0}
{"totalTokens":3026,"inputTokens":3000,"cachedInputTokens":2881,"cacheWriteInputTokens":116,"outputTokens":26,"reasoningOutputTokens":0}
{"input_tokens":2767,"input_tokens_details":{"cache_write_tokens":2764,"cached_tokens":0},"output_tokens":25,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":2792}
{"input_tokens":2884,"input_tokens_details":{"cache_write_tokens":117,"cached_tokens":2764},"output_tokens":48,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":2932}
{"input_tokens":3000,"input_tokens_details":{"cache_write_tokens":116,"cached_tokens":2881},"output_tokens":26,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":3026}
```

`inputTokens` counts the cached and the cache-written tokens too: in each call above,
`inputTokens - cachedInputTokens - cacheWriteInputTokens` is 3 [measured]. The usage maps to
`modelCallUsageSchema` like this:

| `modelCallUsageSchema` field | From `tokenUsage.last`                                     |
| ---------------------------- | ---------------------------------------------------------- |
| `uncachedInputTokens`        | `inputTokens - cachedInputTokens - cacheWriteInputTokens`  |
| `cacheReadTokens`            | `cachedInputTokens`                                        |
| `cacheWrite5mTokens`         | `cacheWriteInputTokens`, or 0: the API reports no lifetime |
| `cacheWrite1hTokens`         | 0, or `cacheWriteInputTokens`, by the same choice          |
| `outputTokens`               | `outputTokens`                                             |
| `reasoningTokens`            | `reasoningOutputTokens`                                    |

The protocol also defines `rawResponse/completed`, documented as an internal notification with the
usage of one Responses API completion [read in the code]. No process sent one, though `initialize`
set `experimentalApi: true` [measured]. `thread/tokenUsage/updated` also carries
`tokenUsage.modelContextWindow`, which was 258400 on every call [measured].

## The tool-call ID in `_meta`

Decision it informs: the descriptor's `toolUseMetaKey` for Codex.

Codex sends `_meta.callId` on every MCP `tools/call`, and it equals the `id` of the `mcpToolCall`
item that app-server reports for that call [measured]. `_meta.itemId` is the model's own call item,
and the 2 calls of the tool turn shared one, so it identifies no single call [measured].

```bash
jq -c '.[] | .body | select(.method == "tools/call") | {callId: .params._meta.callId, itemId: .params._meta.itemId}' mcp.json
jq -c '.[] | select(.method == "item/started" and .params.item.type == "mcpToolCall") | .params.item.id' rpc-first-process.json
```

```text
{"callId":"exec-8392e365-c61a-42ee-abe0-b2256183f674","itemId":"ctc_07f431fd19568aed016aeae921623487d081d25a158dbd5b34"}
{"callId":"exec-79b69c5e-8e21-47f8-b4c5-1632443a7228","itemId":"ctc_07f431fd19568aed016aeae921623487d081d25a158dbd5b34"}
{"callId":"exec-8fc3fa88-7abc-4854-aa68-f7855291300e","itemId":"ctc_07f431fd19568aed016aeae925450487d0871a1ce7a522cc61"}
{"callId":"exec-d2550038-9a30-4e2f-96c8-d2d9b6684125","itemId":"ctc_07f431fd19568aed016aeae92f59d487d09b0ca3f892c31901"}
"exec-8392e365-c61a-42ee-abe0-b2256183f674"
"exec-79b69c5e-8e21-47f8-b4c5-1632443a7228"
"exec-8fc3fa88-7abc-4854-aa68-f7855291300e"
"exec-d2550038-9a30-4e2f-96c8-d2d9b6684125"
```

The same `_meta` holds `x-codex-turn-metadata`: the thread, turn, model and sandbox mode, and for
each workspace its path, and the git remote URLs and last commit of the repo around it [measured].
With the working directory inside a clone, the MCP server got the clone's path, its `origin` URL and
its commit hash [measured, in a pass whose logs held local paths and are not kept]. `run.ts` runs
`git init` in its working directory, so the kept logs show only
`{"<state>/work":{"has_changes":false}}` [measured].

## A websocket the counting proxy can't read

Decision it informs: the provider config the Codex guest writes, so every model call passes the
counting proxy as HTTP.

With `supports_websockets = false` on the custom provider, Codex sent every model call as an HTTP
`POST /v1/responses` [measured]. With `supports_websockets = true`, Codex first asked for a
websocket upgrade on `/v1/responses`, and after the proxy's 426 it sent the call as an HTTP POST
[measured]. The real counting proxy forwards HTTP only
([the counting proxy](../../docs/architecture/policy/counting-proxy.md)) [from a record].

```bash
jq -c '.[] | {path, upgrade, status}' proxy.json | sort | uniq -c
```

```text
      1 {"path":"/v1/responses","upgrade":"websocket","status":426}
     13 {"path":"/v1/responses","upgrade":null,"status":200}
```

## The config keys

Decision it informs: the `config.toml` the Codex guest writes.

`codex app-server --strict-config --print-startup-config` refuses `tool_output_token_limit` under
`[mcp_servers.nixie]`, with
``unknown configuration field `mcp_servers.nixie.tool_output_token_limit` `` [measured]. It accepts
the key at the top level, and it accepts `url`, `bearer_token_env_var`, `required` and
`default_tools_approval_mode = "approve"` under `[mcp_servers.nixie]` [measured]. The MCP server
received each request with an `authorization` header, from `bearer_token_env_var` [measured].

## Capabilities

Decision it informs: the `codex` entry of `harnessCapabilities`.

| Capability          | What shows it                                                                                                 | Source             |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ |
| `tools`             | The tool turn called `find_note` twice and replied with both notes.                                           | [measured]         |
| `fresh-session`     | `thread/start` returned a new thread for the first and third processes.                                       | [measured]         |
| `resume`            | The second process resumed the thread by ID and named `garden, boat, slow`.                                   | [measured]         |
| `resume-at-entry`   | On a `thread/fork` with `lastTurnId`, the model listed only the first turn's message and the new one.         | [measured]         |
| `live-messages`     | `turn/steer` during the slow tool call made the reply end with `kiwi`.                                        | [measured]         |
| `interrupt`         | `turn/interrupt` ended the turn as `interrupted`, and the MCP server got `notifications/cancelled`.           | [measured]         |
| `summarize`         | `thread/compact/start` produced a `contextCompaction` item.                                                   | [measured]         |
| `structured-output` | `outputSchema` on `turn/start` gave the reply `{"note":"The blue rowing boat is moored at the north jetty."}` | [measured]         |
| `images`            | A `localImage` of a red square got the reply `Red`.                                                           | [measured]         |
| `turn-limit`        | Codex has no turn limit setting; the guest counts tool calls and sends `turn/interrupt`.                      | [read in the code] |
| `call-usage`        | One `thread/tokenUsage/updated` for each model call, equal to the API's usage.                                | [measured]         |
| `context-window`    | `tokenUsage.modelContextWindow` was 258400.                                                                   | [measured]         |

A search of the 0.166.0 binary's strings for `max_turns`, `turn_limit` and `max_tool_calls` found
none [measured], so a turn limit is the guest's own count. The interrupt row shows the guest can act
on that count mid-call.

`codex exec --json` gives less. The model-eval spike read one `usage` per turn, and on a resumed
session that usage was the session's running total
([`codex-converse.ts`](../model-eval/codex-converse.ts)) [read in the code]. `codex exec` takes
`--output-schema <FILE>` and `--image <FILE>` [read in the code]. A turn there is one process, so a
steer, an interrupt short of killing the process, and a fork after an entry have no request [read in
the code].

## Verdict

Build the Codex guest on `codex app-server`. Each of the 12 capabilities above has a request or a
notification that this spike used, except `turn-limit`, which the guest counts itself.

| Option                           | Capabilities it can declare                                                     | Effort                                                         | Risk                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `codex app-server` (recommended) | all 12                                                                          | a JSON-RPC client over stdio, about 150 lines in this spike    | the CLI labels app-server experimental, so a release can rename a method; the pin and `generate-ts` show it |
| `codex exec --json`, once a turn | `tools`, `fresh-session`, `resume`, `images`, `structured-output`, `turn-limit` | one process and one JSON line parser a turn, as model-eval has | no usage per call, so no `call` frame; a resumed session reports a running total                            |

The Codex guest needs 4 things from this spike:

1. Set `supports_websockets = false` on its model provider, so no call leaves as a websocket.
2. Put `tool_output_token_limit` at the top level of `config.toml`.
3. Run Codex in a working directory outside any git repo, so `_meta` carries no remote or commit.
4. Send a `call` frame only for a `thread/tokenUsage/updated` that passes the
   [2 conditions](#usage-for-each-model-call).

These would change the pick:

- a Codex release that stops sending `thread/tokenUsage/updated` once a call, or drops `callId` from
  `_meta`;
- a Codex release that sends a call over a websocket with `supports_websockets = false`;
- a Codex guest that needs only one-shot roles, such as the checker, where `exec` costs less to
  build.

## Untested

- `thread/revert`, which the spike read in the protocol and never called.
- A resume or a fork of a thread with a single model call.
- The built-in `openai` provider, and a custom provider that leaves out `supports_websockets`.
- A turn long enough for automatic compaction, and a model call that fails or retries.
- Reasoning effort above `low`, and models other than `gpt-6-luna`.
- An MCP server that refuses the bearer token, and an MCP server that is down at `required = true`.
- Codex inside an imp sandbox, behind the real counting proxy.
