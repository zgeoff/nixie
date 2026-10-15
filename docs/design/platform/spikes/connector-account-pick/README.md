# Spike: the model picks a connector account from its label

A connector tool takes a `connection` argument whose allowed values are short IDs, and the
connection's label and account appear only as each value's description
([the connection argument](../../connectors/connector.md#the-connection-argument)). This spike tests
whether the model passes the ID of the account that the message names, and whether it asks when the
message names none. Every account, label and message here is invented.

- Claude Code 2.1.294, headless (`claude -p`), on a Claude subscription
- Models: `claude-haiku-5-5`, `claude-sonnet-5-5` and `claude-opus-5-5`, all at low effort
- Tools: one mock connector tool per run, from an MCP server over stdio,
  [connector.ts](connector.ts)

## Question

Does the model pick the right account when the label appears only in the tool's input schema, and
how often? Can the [model eval spike](../model-eval/README.md) take this case as it is? What
accuracy should later evals require of this case?

## Run it

Run from this directory. `run.ts` starts `claude -p` once per run, so the Claude CLI must be signed
in, or have `CLAUDE_CODE_OAUTH_TOKEN` set.

```bash
bun install
bun run.ts --out results/<run_name> --configs haiku-low --samples 5
bun run.ts --out results/<run_name> --configs sonnet-low,opus-low --arms id-label --samples 4
bun report.ts results/<run_name> --misses
bun report.ts runs/main.jsonl
bun test
```

`run.ts` appends one JSON line per run and skips runs the output already holds. Git ignores
`results/`. [runs/main.jsonl](runs/main.jsonl) holds the run behind the answer below, with each
reply cut to its start and each call cut to its `connection` value. `report.ts` counts a run whose
CLI call failed apart and leaves it out of every score, and that run holds no failed run.
[build-run-score.ts](build-run-score.ts) scores each run over every call it made, and `bun test`
runs its tests. A `connection` value that is not a string counts as not allowed, even an array that
holds the right ID, and the mock's input check refuses it. Under that rule, the recorded run scores
the same as every number in the answer below, and none changed.

### Cases and arms

[cases.json](cases.json) holds 6 account sets and 34 messages. Each set lists 2 to 6 connections of
one connector: mail drafts, calendar events, Drive search or web search. One set keeps the default
labels, the account addresses, and one keeps the numbered defaults `kagi` and `kagi 2`.

| Kind       | Cases | The message names the account by                      | A run passes when                                          |
| ---------- | ----- | ----------------------------------------------------- | ---------------------------------------------------------- |
| label      | 12    | its label, with a typo or in capitals in 2 cases      | the first call is right, and no call names another account |
| address    | 4     | its address or domain                                 | the first call is right, and no call names another account |
| synonym    | 6     | a paraphrase, such as "my job email" for `Work`       | the first call is right, and no call names another account |
| distractor | 5     | its label, while the content uses another one's label | the first call is right, and no call names another account |
| implied    | 2     | nothing, but the content points at one account        | it asks, or it picks only the right one                    |
| ask        | 5     | nothing                                               | it makes no call                                           |

Each arm names the accounts in the schema in a different way:

| Arm            | `connection` values     | Where the label and account appear      |
| -------------- | ----------------------- | --------------------------------------- |
| `id-label`     | short IDs, as `oneOf`   | each value's description, as designed   |
| `id-only`      | short IDs, as an `enum` | nowhere, as a control                   |
| `id-tool-desc` | short IDs, as an `enum` | a list in the tool description          |
| `label`        | labels, as an `enum`    | the label is the value, with no address |

The system prompt names the owner, says to ask when a request does not make clear which account to
use, and gives the date. A value outside the allowed set fails the input check, and the error lists
the choices, as the connector design describes. Each run is one message, with up to 4 model turns.

## Answer

### The model picks the right account from the label

Each named run is one of the 27 label, address, synonym and distractor cases. The wrong-account and
not-allowed columns count the runs with such a call anywhere in the run, not only first. Cost is per
run.

| Model and arm         | Named runs right | Wrong account | Value not allowed | Ask runs that asked | Implied: right, asked | Cost    |
| --------------------- | ---------------- | ------------- | ----------------- | ------------------- | --------------------- | ------- |
| Haiku, `id-label`     | 135 of 135       | 0             | 0                 | 25 of 25            | 1, 9 of 10            | $0.0009 |
| Sonnet, `id-label`    | 108 of 108       | 0             | 0                 | 20 of 20            | 0, 8 of 8             | $0.017  |
| Opus, `id-label`      | 108 of 108       | 0             | 0                 | 20 of 20            | 8, 0 of 8             | $0.026  |
| Haiku, `id-tool-desc` | 135 of 135       | 0             | 0                 | 25 of 25            | 3, 7 of 10            | $0.0009 |
| Haiku, `label`        | 113 of 135       | 0             | 1                 | 25 of 25            | 0, 10 of 10           | $0.0008 |
| Haiku, `id-only`      | 3 of 135         | 0             | 0                 | 25 of 25            | 0, 10 of 10           | $0.0007 |

- Under the design, every model passed the right short ID on its first call in all 351 named runs,
  and never passed a label in place of an ID. With 0 misses in 351 runs, the 95% upper bound on the
  miss rate is about 0.9%. For Haiku alone, 0 in 135 bounds it at about 2.2%.
- In all 65 ask runs, the model made no call and asked which account to use.
- The label drives the pick. Without it, Haiku asked in 132 of 135 named runs. Its 3 calls took
  "first" and "second" Kagi key to mean the order of the list.
- On the implied cases, Opus picked the right account each time, and Haiku and Sonnet mostly asked.
  Each outcome is safe.
- Labels as values cost 22 named runs, each a question and none a wrong pick. That arm shows no
  address, so the model could not match "my fernway address" or "the band's address" to a label. One
  run in that arm drafted from the right account, then made a second call with no `connection`,
  which the input check refused.
- A label listed in the tool description worked as well as the label in each value's description.
- Claude Code passes the schema to the model unchanged. Asked to print it, Haiku printed the `oneOf`
  with each const and its description.

The runs cost $8.44 in total, pilots included.

### The model eval spike cannot take the case as it is

The model eval's agent runner runs fixed multi-turn tasks against one mock server with a fixed tool
list, and an Opus judge scores the transcripts. This case needs a tool schema for each account set
and arm, one message per run, and a code check of the call log, so it runs in its own harness. The
harness calls `claude -p`, so it needs no package beyond Bun.

### The pass bar

A later eval of this case passes a model when, over at least 100 named runs, such as 4 samples of
the 27 named cases:

- The model makes no wrong-account call anywhere in a run, and no call in an ask case. A wrong
  account sends mail or writes an event as the wrong identity, which the user cannot take back,
  while a question costs one turn. With 0 misses in 108 runs, the 95% upper bound on the miss rate
  is about 3%.
- At least 95% of named runs pass the right value on the first call. Below that, the model keeps
  asking about accounts that the message already named.

The implied cases are reported and never gated, because a pick and a question are both right. Each
model in this spike passes the bar.

### Recommendation

Keep the short ID with the label and account in each value's description. The result calls for no
change to the connector design.

## Untested

- Models outside Claude, such as the GLM models that the model eval recommends for chat.
- A long conversation, and a tool list of many connectors, beside the account choice.
- The second turn: the reply after an input check error, and the call after the user answers a
  question.
- A direct API call without Claude Code's added context.
