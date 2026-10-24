# Spike: the model's reasoning through the Agent SDK

This spike runs one extended-thinking turn for each model profile the deployment's role map names,
through the conversation guest's query options, and records what the model API sent of the model's
reasoning, what the Agent SDK passed on to nixie, and what the Claude Code command-line interface
(CLI) kept in its transcript. Under the options nixie sets, every profile thinks, and nixie receives
no readable reasoning: each thinking block arrives with empty text and an opaque signature. Asking
for the summarized display gives a readable summary of about 1 byte per thinking token, which comes
to about 250 bytes for a conversation turn on Opus 5.5. The spike recommends that the event log
record that summary as an erasable field of the reply, beside a plain count of thinking tokens.

## Question

What does the Agent SDK return of the model's reasoning for each model profile in use: full
reasoning, a summary, a redacted block or nothing? What would recording it cost per turn in storage,
and should the event log record it as an erasable field or leave it out? A moment's span holds what
the event log holds ([moments](../../docs/design/platform/memory/moments.md)), so the model's
reasoning is part of a moment only when the log records it
([GEO-381](https://linear.app/zgeoff/issue/GEO-381)).

## Versions

| Component        | Version                                                    |
| ---------------- | ---------------------------------------------------------- |
| Claude Agent SDK | 0.3.290, the repo's catalog version                        |
| Claude Code      | 2.1.290, bundled with the SDK                              |
| Bun              | 1.4.2                                                      |
| Models           | `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` |

## Setup

The deployment's role map names 3 profiles, all on Anthropic's own endpoint:

| Profile       | Model               | Effort | Roles         |
| ------------- | ------------------- | ------ | ------------- |
| `opus-medium` | `claude-opus-5-5`   | medium | conversation  |
| `sonnet-high` | `claude-sonnet-5-5` | high   | checker       |
| `haiku-low`   | `claude-haiku-5-5`  | low    | memory writer |

[`run.ts`](run.ts) builds each turn's options with the conversation guest's own options builder, so
the CLI gets the production environment, effort and settings. The checker's options set thinking the
same way, through the effort alone. Each profile runs the same invented prompt, a ferry and bus
timetable question that needs a few steps of working, under 3 thinking settings:

- `production`: the options as the guest builds them, which set no thinking option.
- `summarized`: adaptive thinking with the SDK's `summarized` display.
- `omitted`: adaptive thinking with the SDK's `omitted` display.

[`start-capture-proxy.ts`](start-capture-proxy.ts) sits between the CLI and the model API, as the
counting proxy does in [token use per turn](../turn-tokens/README.md). It keeps the thinking setting
each request sent and rebuilds each response's content blocks from the stream. `run.ts` also keeps
the content blocks of every assistant message the SDK yielded, the SDK's thinking-token progress
messages, and the blocks of the session transcript the CLI wrote. Each run file in [`runs/`](runs/)
holds the readable thinking text and the byte length of each signature, never the signature itself.
[`report.ts`](report.ts) prints the table below from the run files.

## Run it

Run from this directory, on a host whose egress adds the model credential, such as an imp sandbox.
The guest holds a placeholder token, as it does in production.

```bash
bun install
bun run.ts
bun report.ts
```

`bun run.ts opus-medium` runs one profile's 3 turns. The 9 turns cost about $0.12 at list prices.

## Results

Each row is one turn of one model call. Output tokens include the thinking tokens, which come from
the result's per-model usage. The byte columns count UTF-8 bytes of thinking text where the API sent
it, where the SDK passed it on and where the CLI's transcript kept it, then the signature on the
SDK's thinking block, any `redacted_thinking` data and the reply's text.

| Profile     | Setting    | Display sent | Output tokens | Thinking tokens | API thinking bytes | SDK thinking bytes | Transcript thinking bytes | Signature bytes | Redacted bytes | Reply bytes |
| ----------- | ---------- | ------------ | ------------- | --------------- | ------------------ | ------------------ | ------------------------- | --------------- | -------------- | ----------- |
| haiku-low   | omitted    | updates      | 612           | 517             | 0                  | 0                  | 0                         | 2284            | 0              | 230         |
| haiku-low   | production | updates      | 480           | 387             | 0                  | 0                  | 0                         | 1900            | 0              | 235         |
| haiku-low   | summarized | summarized   | 466           | 401             | 530                | 530                | 530                       | 1904            | 0              | 160         |
| opus-medium | omitted    | updates      | 484           | 354             | 0                  | 0                  | 0                         | 1828            | 0              | 301         |
| opus-medium | production | updates      | 462           | 343             | 0                  | 0                  | 0                         | 1736            | 0              | 276         |
| opus-medium | summarized | summarized   | 388           | 236             | 194                | 194                | 194                       | 1416            | 0              | 341         |
| sonnet-high | omitted    | updates      | 261           | 170             | 0                  | 0                  | 0                         | 1248            | 0              | 209         |
| sonnet-high | production | updates      | 347           | 245             | 0                  | 0                  | 0                         | 1456            | 0              | 248         |
| sonnet-high | summarized | summarized   | 354           | 254             | 275                | 275                | 275                       | 1444            | 0              | 237         |

### Every profile thinks, and nixie receives no readable reasoning

With no thinking option, the CLI sent adaptive thinking with the display `updates` on every profile,
and every model thought before it answered: 245 to 387 thinking tokens on this prompt. The API then
streamed a thinking block whose deltas held empty text and a running estimate of thinking tokens,
followed by a signature. The SDK passed the block on unchanged, so nixie's assistant message holds a
`thinking` block with an empty `thinking` field and a signature of 1.4 to 2.3 KB. The signature is
the API's encrypted copy of the reasoning, which only the API reads back when the session sends the
block on a later call. The SDK's `omitted` display reached the API as `updates` too, so it gives the
same result as the production options.

The SDK yielded the running estimate to nixie as `thinking_tokens` system messages, and the result
message's per-model usage gave the exact count of thinking tokens. Both are numbers, and neither
holds any of the reasoning.

### The summarized display gives a summary, never the full reasoning

With the `summarized` display, the API streamed readable thinking text, and the SDK and the CLI's
transcript held the same bytes. The text is a summary: 194 bytes for Opus's 236 thinking tokens, 275
bytes for Sonnet's 254 and 530 bytes for Haiku's 401, where English prose runs about 4 bytes a
token. It reads as the model's steps in the first person, such as "I find the earliest one reaching
the north pier at or after 08:55 is the 09:25 ferry". No setting the SDK offers returns the full
reasoning, and the summarized display changed neither the output tokens nor the reply beyond the
spread between runs.

None of the 9 turns returned a `redacted_thinking` block. The API sends one only when its safety
systems flag the reasoning, and an invented timetable question gives them nothing to flag.

### Recording the summary costs about as much as the reply

The summary came to 0.8 to 1.3 bytes per thinking token, and thinking made up 60 to 85% of a turn's
output tokens. The Opus conversation turns in [token use per turn](../turn-tokens/README.md)
averaged 409 output tokens, so a summary of about 300 thinking tokens takes about 250 bytes, close
to the size of a short reply. The [erasable fields](../../docs/architecture/core/erasable-fields.md)
of a record are one JSON object under one key and one IV, so a summary in the reply's erasable
fields adds its own bytes and a field name, and no key. At 50 conversation turns a day, the
summaries add about 12 KB a day and 5 MB a year. A turn that thinks for 5,000 tokens adds 4 to 7 KB.

Recording the signature instead would cost 1.2 to 2.3 KB a turn for bytes nixie cannot read, and the
CLI's transcript keeps it for the session's next call.

## Recommendation

Record the model's reasoning as an erasable field, and leave the signature out:

1. The conversation guest asks for the `summarized` display, so the API returns a summary in place
   of empty thinking text.
2. The guest's assistant frame carries the joined summary text, and the reply record keeps it in its
   erasable fields, beside the reply's text. A forget then removes the reasoning with the reply.
3. The reply record's plain payload keeps the turn's count of thinking tokens, so a projection reads
   the count without a key, and the count outlives a forgotten reply.

The cost is about the size of the reply text the log keeps, and a moment's span then shows why the
model made a choice and not only what it replied. The summary is a paraphrase written by the API,
and a span labels it as a summary of the reasoning, never as the reasoning itself.

## Untested

- A redacted thinking block. No prompt in the spike was meant to trigger one, and a record of it
  holds only opaque data, like the signature.
- A turn with tool calls, which thinks before each call, and a resumed session, which sends earlier
  thinking blocks back to the API. The summarized display might change how either behaves.
- The memory writer and checker turns with their own prompts. They run on the profiles measured
  here, with thinking set the same way.
- The latency of the summarized display, which streams more deltas before the reply.
- Models other than Anthropic's, which may return reasoning in another shape.
