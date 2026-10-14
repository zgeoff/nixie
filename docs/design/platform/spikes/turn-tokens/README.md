# Spike: token use per turn

This spike measures the input, cache write, cached input and output tokens of a turn for each model
role, through the production guest code, and sets the
[model cost](../../policy/budgets.md#model-cost) defaults from them. A turn's tokens come to about
its model calls times its context: a conversation turn makes 1.5 to 2 model calls, and every call
re-reads the whole session from the cache. The fixed part of the context, the Claude Code preamble
with nixie's tools, persona and pinned core, is about 5,400 tokens. Every cache entry the Claude
Code command-line interface (CLI) wrote lived 5 minutes, so the first turn after a pause writes the
whole context to the cache again, at 10 to 16 times the cost of a warm turn. The conversation
dominates every limit, and the checker, the memory writer and the consolidator add about 3% to an
ordinary day.

## Question

How many input, cached input and output tokens does a turn use, for each model role? Slice 5's
spending limits start from the budget defaults this answer sets
([GEO-249](https://linear.app/zgeoff/issue/GEO-249)).

## Versions

| Component        | Version                                                    |
| ---------------- | ---------------------------------------------------------- |
| Claude Agent SDK | 0.3.290, the repo's catalog version                        |
| Claude Code      | 2.1.290, bundled with the SDK                              |
| Bun              | 1.4.2                                                      |
| Models           | `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` |

## Setup

[`run.ts`](run.ts) runs one role on one model and effort through the code that runs it in
production: the conversation guest's turn for the conversation, the memory writer, the consolidator
and the simulated roles, and the check guest's query for the checker. Each turn gets the production
system prompt and the tool list the production builders give the role, from
[`build-role-tools.ts`](build-role-tools.ts). [`start-tool-server.ts`](start-tool-server.ts) serves
those tools over Streamable HTTP, as the run's endpoint does, and returns a scripted result for each
call.

Every model request goes through [`start-count-proxy.ts`](start-count-proxy.ts), a local stand-in
for the [counting proxy](../../policy/budgets.md#the-hard-spending-stop). The profile's base URL
points at the proxy, which forwards each request to the model API and reads the usage from each
response. The proxy's totals matched the guest's turn-ended usage in every turn, so the turn records
count every model call a turn makes.

[`spike-fixtures.ts`](spike-fixtures.ts) holds the invented input: a 175-word persona for an owner
called Sam, 10 pinned and 50 other memories, and 12 messages with the retrieved items the turn
places before each one.

| Role                  | What runs                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `conversation`        | 12 turns on one session, each resuming the one before, with time, web fetch, log and memory calls |
| `checker`             | The production checker prompt on the eval corpus's first 12 pairs                                 |
| `memory-writer`       | The 24 messages of the Opus conversation in 6 batches of 4, with 20 shown items                   |
| `memory-consolidator` | One consolidation over the 60 items with their quotes                                             |
| `task`                | Simulated: 3 job runs, each a fresh session on the conversation's prompt and tools                |
| `worker`              | Simulated: 3 worker runs, each a fresh session with web fetch and a one-paragraph prompt          |

The `task` and `worker` roles have no built prompt or runner yet, so their rows measure the nearest
shape the built code gives. [`report.ts`](report.ts) prints the table below from the run files in
[`runs/`](runs/), and prices each row at Anthropic's list prices.

## Run it

Run from this directory, on a host whose egress adds the model credential, such as an imp sandbox.
The guest holds a placeholder key, as it does in production.

```bash
bun install
bun run.ts conversation claude-opus-5-5 medium
bun run.ts memory-writer claude-haiku-5-5 low
bun report.ts
```

The writer reads the replies of the Opus conversation run, so that run goes first. `COLD_WAIT_S=400`
on a conversation run adds a 13th turn after the cache has expired.

## Results

Each row is the mean of its sessions: one turn for the conversation, one query for the checker, one
batch for the writer and one run for the rest. Input counts uncached input only. Total is the sum of
all 4 counts, as a budget's token count adds them. Largest is the largest session's total. Cost is
at list prices, which a subscription makes notional. Every call ran on the subscription, and the
spike spent no API money.

| Role                | Model           | Sessions | Calls | Input | Cache write | Cached input | Output | Total  | Largest | Cost    |
| ------------------- | --------------- | -------- | ----- | ----- | ----------- | ------------ | ------ | ------ | ------- | ------- |
| conversation        | Opus 5.5 medium | 12       | 2.0   | 6     | 1,032       | 22,010       | 406    | 23,455 | 49,848  | $0.0177 |
| conversation        | Sonnet 5.5 low  | 12       | 1.7   | 5     | 1,241       | 15,871       | 287    | 17,405 | 28,411  | $0.0092 |
| conversation        | Haiku 5.5 low   | 12       | 1.5   | 5     | 716         | 13,780       | 214    | 14,715 | 26,557  | $0.0003 |
| conversation, cold  | Opus 5.5 medium | 1        | 1     | 4     | 17,367      | 0            | 169    | 17,540 | 17,540  | $0.0902 |
| checker             | Sonnet 5.5 low  | 12       | 1.0   | 2     | 649         | 1,348        | 143    | 2,141  | 2,453   | $0.0033 |
| checker             | Haiku 5.5 low   | 12       | 1.1   | 2     | 669         | 1,512        | 270    | 2,453  | 5,413   | $0.0002 |
| memory-writer       | Haiku 5.5 low   | 6        | 1.2   | 2     | 1,931       | 2,284        | 231    | 4,448  | 8,719   | $0.0004 |
| memory-writer       | Opus 5.5 medium | 6        | 1.5   | 3     | 2,013       | 3,540        | 371    | 5,927  | 12,312  | $0.0182 |
| memory-consolidator | Opus 5.5 medium | 1        | 2.0   | 4     | 6,848       | 5,711        | 1,323  | 13,886 | 13,886  | $0.0619 |
| memory-consolidator | Haiku 5.5 low   | 1        | 2.0   | 4     | 8,593       | 5,678        | 2,882  | 17,157 | 17,157  | $0.0026 |
| task, simulated     | Opus 5.5 medium | 3        | 2.7   | 5     | 3,938       | 13,016       | 891    | 17,850 | 21,969  | $0.0401 |
| task, simulated     | Haiku 5.5 low   | 3        | 2.3   | 5     | 2,034       | 12,084       | 651    | 14,774 | 17,735  | $0.0007 |
| worker, simulated   | Opus 5.5 medium | 3        | 2.0   | 4     | 3,163       | 960          | 705    | 4,831  | 6,335   | $0.0301 |
| worker, simulated   | Haiku 5.5 low   | 3        | 2.0   | 4     | 3,129       | 926          | 648    | 4,708  | 6,313   | $0.0007 |

### A turn costs its model calls times its context

Each model call sends the whole session, and the cache serves all of it but the newest message. The
Opus conversation's context grew from 5,458 tokens at turn 1 to 17,277 at turn 12, about 1,000
tokens a turn, and a turn that fetched a page grew it by about 2,000. A turn's total therefore rises
with the session and with its calls: the 1-call turn 4 counted 10,490 tokens, and the 3-call turn 10
counted 49,848. Output stays small beside it, at 400 tokens a turn on Opus and 200 to 300 on the
others.

The CLI compacts the session near its window, which is 200,000 tokens when the profile sets no
context cap. At about 1,000 tokens a turn, a session runs about 190 turns between compactions, at a
mean context near 100,000 tokens. The mean conversation turn on Opus then counts about 200,000
tokens, and a late one near the window about 400,000.

### A turn after a pause rewrites its context to the cache

All 135 model calls in the recorded runs wrote 5-minute cache entries, and none wrote a 1-hour
entry. The cold turn ran 400 seconds after turn 12 and wrote all 17,367 tokens of its context to the
cache, where the warm turn 12, one call on the same context, wrote 204. It cost $0.090 against
$0.0055 for turn 12. At a 100,000-token context, a cold Opus turn costs about $0.53 and a warm one
about $0.05, so the share of turns that start after a pause sets most of the conversation's dollar
cost. Tokens do not depend on it, because a cache write counts the same as a cached read.

### What a day costs

A day of 50 conversation turns in 15 bursts, at the mean context of a compaction cycle, counts about
10,000,000 tokens and costs about $10 on Opus 5.5. A heavy day of 100 turns in 25 bursts late in a
cycle, at about 180,000 tokens of context, counts about 36,000,000 tokens and costs about $30. The
memory writer at 25 batches, a consolidation and 50 checks add under 300,000 tokens and under $1 on
any model. On Haiku 5.5 or Sonnet 5.5, a conversation turn makes fewer calls, and its tokens fall by
15 to 25%.

A worker run that reads a 3,000-token page on each of its 25 allowed model calls reaches about
80,000 tokens of context and counts about 985,000 tokens over the run, at about $0.76 on Opus. The
measured worker runs and job runs stayed under 22,000 tokens and $0.05 each.

## Budget defaults

The defaults in [model cost](../../policy/budgets.md#model-cost) follow from these numbers, each
about twice the heaviest legitimate use, because a limit exists to stop a fault:

| Limit          | Was                      | Set to                   | Reason                                                     |
| -------------- | ------------------------ | ------------------------ | ---------------------------------------------------------- |
| Per worker run | $1, 500,000 tokens       | $1, 1,000,000 tokens     | 25 page-reading calls count about 985,000 tokens           |
| Per job run    | $5, 2,000,000 tokens     | unchanged                | measured job runs use about 1% of it                       |
| Per day        | $20, 10,000,000 tokens   | $40, 40,000,000 tokens   | a heavy day counts 36,000,000 tokens and costs $30 on Opus |
| Per month      | $300, 200,000,000 tokens | $600, 600,000,000 tokens | 30 ordinary days count 300,000,000 tokens and cost $300    |

The turn limits stay as they were: a heavy day makes about 300 model calls across every role,
against a limit of 1,000.

## Untested

- Real conversations. The script's replies are short, and a conversation with longer replies or more
  fetched pages grows its context faster and reaches compaction sooner.
- The `task` and `worker` roles as built, with their own prompts and runners.
- A session near the compaction window, and the compaction call itself. The projections extend the
  measured growth to the window.
- The 1-hour cache. The CLI wrote only 5-minute entries, and the spike tried no setting that asks
  for longer ones. A profile's single cache write price fits the 5-minute rate; a 1-hour entry costs
  twice the input price.
- Models other than Anthropic's, whose reasoning effort and caching differ.
