# Spike: token use per turn

This spike measures the input, cache write, cached input and output tokens of a turn for each model
role, through the production guest code, and sets the
[model cost](../../policy/budgets.md#model-cost) defaults from them. A turn's tokens come to about
its model calls times its context: a conversation turn makes 1.6 to 2.1 model calls, and every call
re-reads the whole session from the cache. The fixed part of the context, the Claude Code preamble
with nixie's tools, persona and pinned core, is about 4,900 tokens. Every cache entry the Claude
Code command-line interface (CLI) wrote lived 5 minutes, so the first turn after a pause writes the
whole context to the cache again, at about 13 times the cost of a warm turn. The conversation
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
called Sam, 10 pinned and 50 other memories with the words Sam said, and 12 messages with the
retrieved items the turn places before each one. Each message renders through the production inbox
renderer, so its stamp carries the event ID that the memory tools cite, with its time and zone. The
scripted tools return results in the production result shapes and keep the memory state of one run,
so a proposal that one call adds shows in the pending list that a later call reads.

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
| conversation        | Opus 5.5 medium | 12       | 2.1   | 6     | 1,032       | 21,294       | 383    | 22,716 | 62,174  | $0.0171 |
| conversation        | Sonnet 5.5 low  | 12       | 1.6   | 5     | 1,112       | 13,493       | 229    | 14,839 | 26,133  | $0.0064 |
| conversation        | Haiku 5.5 low   | 12       | 1.7   | 5     | 1,142       | 14,406       | 227    | 15,781 | 26,892  | $0.0004 |
| conversation, cold  | Opus 5.5 medium | 1        | 1     | 4     | 12,480      | 3,717        | 164    | 16,365 | 16,365  | $0.0664 |
| checker             | Sonnet 5.5 low  | 12       | 1.0   | 2     | 649         | 1,348        | 138    | 2,136  | 2,414   | $0.0031 |
| checker             | Haiku 5.5 low   | 12       | 1.1   | 2     | 630         | 1,511        | 260    | 2,403  | 4,438   | $0.0002 |
| memory-writer       | Haiku 5.5 low   | 6        | 1.2   | 2     | 1,818       | 2,273        | 226    | 4,319  | 7,795   | $0.0004 |
| memory-writer       | Opus 5.5 medium | 6        | 1.7   | 3     | 2,022       | 4,093        | 390    | 6,509  | 11,811  | $0.0187 |
| memory-consolidator | Opus 5.5 medium | 1        | 2.0   | 4     | 7,068       | 5,409        | 1,912  | 14,393 | 14,393  | $0.0747 |
| memory-consolidator | Haiku 5.5 low   | 1        | 2.0   | 4     | 6,923       | 5,376        | 1,514  | 13,817 | 13,817  | $0.0017 |
| task, simulated     | Opus 5.5 medium | 3        | 3.3   | 7     | 2,940       | 17,287       | 857    | 21,090 | 31,450  | $0.0353 |
| task, simulated     | Haiku 5.5 low   | 3        | 2.3   | 5     | 3,542       | 9,121        | 630    | 13,298 | 15,567  | $0.0008 |
| worker, simulated   | Opus 5.5 medium | 3        | 2.0   | 4     | 3,305       | 960          | 595    | 4,864  | 6,350   | $0.0286 |
| worker, simulated   | Haiku 5.5 low   | 3        | 2.0   | 4     | 3,271       | 926          | 702    | 4,903  | 6,415   | $0.0008 |

### A turn costs its model calls times its context

Each model call sends the whole session, and the cache serves all of it but the newest message. The
Opus conversation's context grew from 4,876 tokens at turn 1 to 16,109 at turn 12, about 1,000
tokens a turn, and a turn that fetched a page grew it by about 2,000. A turn's total therefore rises
with the session and with its calls: the 1-call turn 5 counted 10,035 tokens, and the 4-call turn 11
counted 62,174. Output stays small beside it, at about 380 tokens a turn on Opus and 230 on the
others.

A save adds a call to the turn that makes it. Each message's stamp carries the event ID that a save
cites, so no model read the log to find an ID, and every model saved the running days that turn 6
states. Opus proposed a memory in 3 turns, Sonnet in 2 and Haiku in 1.

The CLI compacts the session near its window, which is 200,000 tokens when the profile sets no
context cap. At about 1,000 tokens a turn, a session runs about 190 turns between compactions, at a
mean context near 100,000 tokens. The mean conversation turn on Opus then counts about 210,000
tokens, and a late one near the window about 400,000.

### A turn after a pause rewrites its context to the cache

All 140 model calls in the recorded runs wrote 5-minute cache entries, and none wrote a 1-hour
entry. The cold turn ran 400 seconds after turn 12 and wrote 12,480 tokens of its 16,201-token
context to the cache, where the warm turn 12, one call on the same context, wrote 232. The cache
still held the first 3,717 tokens, from an entry the spike did not trace. The cold turn cost $0.066
against $0.0052 for turn 12. At a 100,000-token context, a cold Opus turn costs about $0.53 and a
warm one about $0.05, so the share of turns that start after a pause sets most of the conversation's
dollar cost. Tokens do not depend on it, because a cache write counts the same as a cached read.

### What a day costs

A day of 50 conversation turns in 15 bursts, at the mean context of a compaction cycle, counts about
10,500,000 tokens and costs about $10 on Opus 5.5. A heavy day of 100 turns in 25 bursts late in a
cycle, at about 180,000 tokens of context, counts about 38,000,000 tokens and costs about $31. The
memory writer at 25 batches, a consolidation and 50 checks add about 300,000 tokens and under $1 on
any model. A profile with a larger context cap scales the conversation's share with the cap, so a
400,000-token cap doubles it. On Haiku 5.5 or Sonnet 5.5, a conversation turn makes 1.6 calls
against 2.1 on Opus, and its tokens fall by about a quarter.

A worker run that reads a 3,000-token page on each of its 25 allowed model calls, with about 350
tokens of output each, reaches about 81,000 tokens of context and counts about 1,030,000 tokens over
the run, at about $0.78 on Opus. A job run that starts 2 such workers counts about 2,100,000. The
measured worker runs and job runs stayed under 32,000 tokens and $0.05 each.

## Budget defaults

The defaults in [model cost](../../policy/budgets.md#model-cost) follow from these numbers, each
about twice the heaviest legitimate use or more, because a limit exists to stop a fault:

| Limit          | Was                      | Set to                   | Reason                                                      |
| -------------- | ------------------------ | ------------------------ | ----------------------------------------------------------- |
| Per worker run | $1, 500,000 tokens       | $2, 2,000,000 tokens     | 25 page-reading calls count 1,030,000 tokens and cost $0.78 |
| Per job run    | $5, 2,000,000 tokens     | $5, 4,000,000 tokens     | a job run with 2 such workers counts 2,100,000 tokens       |
| Per day        | $20, 10,000,000 tokens   | $60, 80,000,000 tokens   | a heavy day counts 38,000,000 tokens and costs $31 on Opus  |
| Per month      | $300, 200,000,000 tokens | $600, 600,000,000 tokens | 30 ordinary days count 315,000,000 tokens and cost $300     |

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
  twice the input price. [GEO-890](https://linear.app/zgeoff/issue/GEO-890) tracks the question.
- Models other than Anthropic's, whose reasoning effort and caching differ.
