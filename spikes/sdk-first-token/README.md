# Spike: Agent SDK time to first token

This spike times an Agent SDK turn in nixie's assistant placement, from the call that sends the
prompt to the first streamed text token and to the result. The SDK's own share is small once a
process is up: a turn on a live process reaches the model request in about 10 ms, and a new process
takes about 270 ms. The model's time to its first token decides the rest. On a live process, Haiku
5.5 gave the first text token at a median of 0.57 s, and Sonnet 5.5 and Haiku 4.5 took about 2 s. A
voice pipeline around nixie's own turn works with Haiku 5.5 on a process held open for the call.

## Question

How long does a turn take from the moment nixie sends the prompt to the first streamed text token,
and to the end of the turn, in the placement from
[0003](../../docs/decisions/0003-sdk-placement.md)? How do a new process per turn, a resumed
session, and a process kept alive between turns compare, and how much do nixie's in-process tools
add? The voice stack waits on the answer
([open items](../../docs/design/open-items.md#deferred-decisions)): a pipeline of speech-to-text,
nixie's own turn and text-to-speech costs about 1.3 to 1.5 s from the end of speech to the reply
before the model's share.

## Versions

| Component        | Version                                                              |
| ---------------- | -------------------------------------------------------------------- |
| Claude Agent SDK | 0.3.293                                                              |
| Claude Code      | 2.1.293, bundled with the SDK                                        |
| Bun              | 1.4.2                                                                |
| Host             | WSL2 on Windows, Linux 6.6.87.2, 16 cores                            |
| Models           | `claude-haiku-4-5-20251001`, `claude-haiku-5-5`, `claude-sonnet-5-5` |

## Setup

[`setup.ts`](./setup.ts) builds the options of the assistant placement: `tools: []`,
`settingSources: []`, `strictMcpConfig: true`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, a
neutral working directory per run, and a 1-sentence persona as the whole system prompt. With tools,
an in-process SDK MCP server offers 3 stub tools, and a chat prompt never calls them. Haiku 5.5 and
Sonnet 5.5 run at `effort: 'low'`, the chat setting from the
[model-eval spike](../model-eval/README.md). Haiku 4.5 runs at its default, which has extended
thinking on. Each run keeps Claude Code's config folder in a temp directory, never in `~/.claude`.

[`bench.ts`](./bench.ts) starts a turn in 6 ways. The clock starts when nixie hands the SDK the
prompt.

| Mode      | What runs                                                                  | Clock starts at        |
| --------- | -------------------------------------------------------------------------- | ---------------------- |
| `fresh`   | A new `query()` and process, with a config folder of its own               | `query()`              |
| `cold`    | A new `query()` and process, with a config folder that earlier runs filled | `query()`              |
| `resume`  | A new `query()` and process with `resume`, for the session's turn 2        | `query()`              |
| `stream`  | One `query()` with a prompt stream, for 3 turns on one process             | Each prompt's push     |
| `startup` | `startup()` spawns the process ahead of the turn                           | `WarmQuery.query()`    |
| `prewarm` | `prewarm()` parks a spare process, and `claim()` binds it to a folder      | `SpareProcess.claim()` |

`prewarm()` and `startup()` are in the SDK's types; `prewarm()` is marked `@alpha`. The bench waits
500 ms after either one before it starts the clock. It runs the cells round-robin, so drift over a
run spreads across them, and it writes one row per turn to `results/`. Each row holds the time to
the init message, to the CLI's `requesting` status, to the first thinking and text deltas of
`includePartialMessages`, and to the result. Each row also holds the result's own timing fields,
such as `ttft_stream_ms`, and the host's load average.

[`report.ts`](./report.ts) prints the median and the 90th percentile of each timing, in ms, per
cell.

## Run it

Run each command from this directory. The commands read a subscription token from 1Password through
a service-account token with access to the `nixie` vault, so the token never lands on disk.

```bash
bun install
CLAUDE_CODE_OAUTH_TOKEN=$(OP_SERVICE_ACCOUNT_TOKEN=<service_account_token> op read "op://nixie/claude-code-oauth-token/credential") \
  env -u ANTHROPIC_API_KEY bun bench.ts --out results/<run_name>.jsonl --samples 10
bun report.ts results/<run_name>.jsonl --by model,mode
```

`--models`, `--modes` and `--tools` narrow the matrix, and `--no-thinking` turns extended thinking
off. Git ignores `results/`.

## Results

Each cell holds the median and the 90th percentile, in ms. The model run took 10 samples per model,
tool count and mode, 480 turns in all, and every turn ended in `success`. The host is shared with
other work: the last sample of the run ran under a load average above 30, so the bench ran that
sample again at a load average of 4 to 22, and the tables use the second run.

### The SDK's own time

The model does not change these times, so the table pools all 3 models and both tool counts, 60
turns per row. `init` is the SDK's init message, and `requesting` is the CLI's status message as it
sends the model request.

| Mode                    | To `init` | To `requesting` |
| ----------------------- | --------- | --------------- |
| `fresh`                 | 663 / 905 | 667 / 912       |
| `cold`                  | 270 / 381 | 274 / 388       |
| `resume`, turn 2        | 319 / 479 | 323 / 484       |
| `stream`, turn 1        | 285 / 393 | 289 / 398       |
| `stream`, turn 2        | 11 / 23   | 12 / 25         |
| `stream`, turn 3        | 8 / 15    | 9 / 16          |
| `startup`               | 23 / 33   | 26 / 40         |
| `prewarm` and `claim()` | 65 / 119  | 69 / 122        |

### Time to the first text token and to the result

Each row pools both tool counts, 20 turns per row, except the `stream` rows for turns 2 and 3, which
pool 40.

| Model      | Mode                | To first text | To result   |
| ---------- | ------------------- | ------------- | ----------- |
| Haiku 5.5  | `fresh`             | 1363 / 1834   | 1612 / 2051 |
| Haiku 5.5  | `cold`              | 872 / 997     | 1115 / 1294 |
| Haiku 5.5  | `resume`, turn 2    | 961 / 1084    | 1238 / 1440 |
| Haiku 5.5  | `stream`, turns 2–3 | 566 / 1241    | 874 / 1429  |
| Haiku 5.5  | `startup`           | 643 / 695     | 876 / 1033  |
| Haiku 5.5  | `prewarm`           | 697 / 948     | 951 / 1155  |
| Sonnet 5.5 | `cold`              | 2047 / 3208   | 2813 / 3897 |
| Sonnet 5.5 | `stream`, turns 2–3 | 1748 / 3944   | 2391 / 4671 |
| Sonnet 5.5 | `prewarm`           | 1123 / 3081   | 1827 / 3653 |
| Haiku 4.5  | `cold`              | 2160 / 3030   | 2447 / 3259 |
| Haiku 4.5  | `stream`, turns 2–3 | 2057 / 2865   | 2358 / 3220 |
| Haiku 4.5  | `prewarm`           | 1761 / 2226   | 2063 / 2559 |

The model's own share is the time from `requesting` to the first text token. For Haiku 5.5 and
Sonnet 5.5, it matched the result's `ttft_stream_ms` field within 40 ms in 9 of 10 turns, over all
160 turns of each:

| Model      | Request to first text | `ttft_stream_ms` |
| ---------- | --------------------- | ---------------- |
| Haiku 5.5  | 604 / 850             | 624 / 883        |
| Sonnet 5.5 | 1500 / 3868           | 1515 / 3902      |
| Haiku 4.5  | 1854 / 2746           | 636 / 1308       |

Haiku 4.5 ran with extended thinking on. Its `ttft_stream_ms` counts the first stream event, which
opens the thinking block, and the first text token came about 1.2 s later. Haiku 5.5 and Sonnet 5.5
at low effort streamed no thinking deltas.

### Nixie's tools

Three in-process tools changed nothing measurable for Haiku 5.5, over 80 turns each:

| Model      | Tools | To first text | To result   |
| ---------- | ----- | ------------- | ----------- |
| Haiku 5.5  | 0     | 850 / 1435    | 1119 / 1629 |
| Haiku 5.5  | 3     | 852 / 1404    | 1069 / 1637 |
| Sonnet 5.5 | 0     | 1479 / 3232   | 2136 / 3902 |
| Sonnet 5.5 | 3     | 2433 / 5590   | 3193 / 6383 |
| Haiku 4.5  | 0     | 1984 / 2711   | 2330 / 3036 |
| Haiku 4.5  | 3     | 2175 / 3143   | 2464 / 3412 |

Sonnet 5.5 spread its model time from 0.7 s to 11 s across its 160 turns, so the spike cannot
attribute the gap between its tool rows to the tools.

### Extended thinking off

A second run with `--no-thinking` took 10 samples of `cold`, `stream` and `prewarm` per model, all
with 3 tools, 150 turns in all. It ran under a load average of 11 to 64 from other work on the host,
which slowed every process start, so the table gives only the model's share: the time from
`requesting` to the first text token, over 50 turns per model.

| Model      | Thinking on, low effort | Thinking off |
| ---------- | ----------------------- | ------------ |
| Haiku 5.5  | 604 / 850               | 708 / 1615   |
| Sonnet 5.5 | 1500 / 3868             | 1611 / 5671  |
| Haiku 4.5  | 1854 / 2746             | 770 / 1440   |

Haiku 4.5 without thinking came within 0.2 s of Haiku 5.5 at the median. Turning thinking off did
not speed up Haiku 5.5 or Sonnet 5.5 at low effort, and neither streamed thinking deltas in either
run.

### Where a new process spends its time

A `--debug-file` log of one `fresh` start and one `cold` start shows the split. A new process with a
filled config folder takes about 270 ms to start Claude Code and send the init message. With a
config folder of its own, the CLI first waits on 2 requests to `api.anthropic.com`, which adds about
400 ms before the init message:

```text
[mcp-policy-cold-start] waiting on remote managed-settings load
Remote settings: No settings found (404)
[mcp-policy-cold-start] waiting on the policy-limits verdict (compliance taints feed config ${VAR} expansion)
Policy limits: Fetched successfully
```

With a filled config folder, the CLI sends the model request first and checks both caches after it:

```text
[API REQUEST] /v1/messages x-client-request-id=<request_id> source=sdk
Policy limits: Cache still valid (304 Not Modified)
Remote settings: No settings found (404)
```

The init message reaches nixie about 4 ms before the model request leaves, in every mode. An
unauthenticated `POST` to `api.anthropic.com/v1/messages` from the same host took 275 to 345 ms over
5 tries, with TLS set up in about 28 ms.

## Answers

### The SDK's share

The SDK adds about 10 ms to a turn on a process that is already up, and about 270 ms to a turn that
starts a new process. A config folder that no earlier run filled adds about 400 ms more, so nixie
keeps Claude Code's config folder across restarts. `resume` costs 50 ms more than `cold`, to load
the session. `startup()` and `prewarm()` move the process start ahead of the turn and leave 25 to 70
ms on it.

### The model's share

The model's time to its first token decides the turn. Haiku 5.5 at low effort took 0.6 s at the
median from request to first text, and 0.85 s at the 90th percentile. Sonnet 5.5 at low effort took
1.5 s at the median and spread to 3.9 s at the 90th percentile. Haiku 4.5 took 1.9 s with extended
thinking on, and 0.77 s with it off.

### Voice

A pipeline around nixie's own turn is viable with Haiku 5.5 on a process kept alive between turns.
On a `stream` session, its first text token came at 0.57 s at the median and 1.24 s at the 90th
percentile. Added to the pipeline's 1.3 to 1.5 s, the owner hears the reply about 1.9 to 2.1 s after
speaking at the median, and about 2.5 to 2.7 s at the 90th percentile. Both percentiles of that
first token stay within the 1.5 s budget that the open items set for the turn. A new process per
turn adds about 0.3 s.

Sonnet 5.5 and Haiku 4.5 at these settings take 1.7 to 2.2 s to the first text token at the median,
so the reply comes 3 to 3.7 s after speech at the median, and later at the 90th percentile. Haiku
4.5 with thinking off came near Haiku 5.5 in its model time, in a run under host load.

A live process per conversation is the shape that serves voice: one `query()` with a prompt stream,
held open for the call. `prewarm()` serves the first turn of a call with 70 ms of SDK time, but it
is an alpha API.

## Untested

- Long contexts. Every prompt here is under 1,000 tokens with the system prompt, and a real
  conversation with memory and tool results grows the model's time to first token.
- A turn that calls a tool. The tools were offered and never called.
- Time of day and load on the API. The model run spanned about 45 minutes.
- An API key in place of the subscription token, which may route to different capacity.
- The cache lifetime of the remote settings and policy limits in the config folder, and whether an
  expired cache makes a start wait again.
- A process held open for a long call: idle timeouts, memory growth, and how the process behaves
  after minutes without a turn.
- The speech-to-text and text-to-speech stages, which the 1.3 to 1.5 s figure comes from.
