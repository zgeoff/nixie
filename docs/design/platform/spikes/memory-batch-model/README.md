# Spike: batched memory capture with a real model

This spike runs the batched memory writer from [memory writes](../../memory/writes.md) with a real
model and measures 3 things: how many facts it captures, how long a fact waits before it is stored,
and what the input costs. It also estimates what a backfill of a long event log costs and how long
it takes, because the first memory build starts the writer's cursor at the start of the log. The
[offline batch spike](../memory-batch/) tested the cursor and recovery with fixture output; this
spike replaces the fixture output with model calls.

- Writer: `claude-haiku-5-5` at low effort, the memory-writing pick of the
  [model eval](../model-eval/README.md#recommended-split), through headless Claude Code 2.1.296
- Judge: `claude-opus-5-5` at medium effort, which labels each candidate and never sees the writer's
  prompt
- Gate: the quote and token checks from the [checks spike](../memory-checks/checks.ts), imported
  directly
- Input: a synthetic two-day conversation of 40 turns written for this spike, with no real history

## Question

With a real model on the `memory-writer` role, what share of your stated facts does a batch writer
capture, how many minutes pass between your message and the stored memory, and what does each batch
cost? What does a first run over a long log cost, and how long does it take, at different batch
sizes?

## Run it

Run from this directory. The writer reads the OAuth token from the vault.

```bash
bun install
export CLAUDE_CODE_OAUTH_TOKEN=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../../../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/claude-code-oauth-token/credential'
)
env -u ANTHROPIC_API_KEY bun --no-env-file run.ts --samples 3 --out runs/live
env -u ANTHROPIC_API_KEY bun --no-env-file run.ts --samples 3 --size 20 --out runs/size-20
env -u ANTHROPIC_API_KEY bun --no-env-file run.ts --samples 3 --size 40 --out runs/size-40
bun report.ts runs/live/run.json runs/size-20/run.json runs/size-40/run.json
```

- [conversation.ts](conversation.ts) holds 3 seed items, 40 turns with times, 15 gold facts and 8
  traps: a pasted message, a hypothetical, a quoted line from someone else, a denial, 2 facts only
  the assistant states, a message drafted for others and a repeat. Three gold facts change a seed
  item, and one is a weekly class that ends the next day.
- [plan-batches.ts](plan-batches.ts) cuts the turns into batches. Live mode replays the design's
  triggers on a virtual clock: 4 turns, 5 minutes idle or 20 minutes since the oldest unprocessed
  message. Backfill mode cuts fixed-size batches.
- [run-writer.ts](run-writer.ts) sends one batch to the writer, with its record IDs, the active
  items and pasted spans marked. The writer has no tools: a JSON schema stands in for
  `memory.remember`, `memory.retire` and `memory.recall`, and the host gives it every active item.
- [run.ts](run.ts) gates each candidate, applies those that pass and asks the judge to label every
  candidate. [report.ts](report.ts) prints the tables below from the recorded runs in
  [runs/](runs/), and [rejudge.ts](rejudge.ts) labels a recorded run again without calling the
  writer.

A gold fact counts as captured when an applied candidate carries it and no active item still states
its older form, such as the old address with no mention of the move. The judge labels candidates
only; code scores the final memory.

## Results

### Capture quality

Each row is 3 samples over the same 40 turns. "Bad applied" counts applied candidates the judge
labelled unsupported, a trap or a duplicate. The judge reads each candidate beside its whole source
message, so it can tell what a short quote refers to.

| Batches            | Gold captured | Bad applied | Traps proposed | Extra true facts |
| ------------------ | ------------- | ----------- | -------------- | ---------------- |
| Live, 4 turns      | 14, 14, 14    | 1, 0, 0     | 0              | 0, 1, 1          |
| Backfill, 20 turns | 11, 12, 11    | 1, 1, 0     | 0              | 1, 0, 0          |
| Backfill, 40 turns | 13, 12, 12    | 0, 0, 2     | 0              | 1, 1, 0          |

The live writer captured the same 14 of 15 facts in every sample, revised all 3 seed items in place
and retired the pottery class when it ended. It never proposed a trap: no candidate quoted pasted
text, the hypothetical move, Sam's quoted line, the denied peanut allergy, the drafted sick note or
a fact only the assistant stated. Its one miss, in all 9 samples across all sizes, was "sign it with
just my initials, R.M.", which it treated as a one-off instruction. Each sample also stored "I
wouldn't say I hate hiking, but long ones wipe me out". Two samples stored it as "The owner finds
long hikes exhausting.", a fair memory outside the gold list, and one added "and does not like
them", which the message denies.

Larger batches lost facts. Across 6 samples they missed the usual lunch place 3 times and "I don't
have a car" twice, and twice they added the new address as a second item while "14 Elm Row" stayed
active, so memory held 2 contradicting addresses. They also never stored the pottery class, because
it starts and ends inside one batch; the final memory is correct there, so that miss costs nothing.
Of their 3 bad-applied candidates, 2 are the duplicate address, and the third is the hiking fact
with "keeps walks under 10 km", a detail only the assistant's reply states. No batch at any size
needed the clash retry. Every one of the 126 candidates passed the code checks, so the writer's
quotes were exact and the checks never had to stop a writer error.

### Capture delay

Capture delay is the time from your message to the stored memory, and the trigger wait dominates it.
In live mode, the median applied fact was stored 5.6 minutes after the message, the 90th percentile
10.6 minutes and the slowest 10.6 minutes. A batch waited a median of 8.5 minutes from its first
turn to its trigger, while extraction took a median of 3.9 seconds, a 90th percentile of 4.4 seconds
and a maximum of 8.9 seconds. The triggers therefore bound the delay: a fact waits at most the
20-minute age limit plus a few seconds of extraction. The fixture never reached that limit, because
the count and idle triggers fired first.

### Input cost

A live batch of 4 turns sent a mean of 2,136 input tokens and produced 383 output tokens. Of the
input, 1,067 tokens are the system prompt and harness preamble, a cache read from the second batch
on. Claude Code writes the rest, the batch text and the active items, to a 1-hour cache that no
later batch reads, at twice the input price. One batch cost $0.0004 at Haiku 5.5 list prices, and
the conversation cost $0.0046, or $0.011 per 100 turns. The harness reported the 1-hour cache write
itself, and its own cost figure matched the priced token counts in every run, which confirms the
price table in [report.ts](report.ts).

The samples ran in parallel, so 5 first batches read a cached prompt that another sample wrote. The
report reprices that read as a write, as a lone writer pays it; the recorded figure was $0.0044 a
conversation.

### Backfill of a long log

The estimate takes 20,000 turns, about a year at 55 turns a day. A straight-line fit over all 42
recorded batches gives 1,965 input tokens per batch plus 47 per turn, and 3.2 seconds per batch plus
0.26 seconds per turn. The batches run one after another, because each one reads the items the one
before it wrote. The last column prices each turn at 400 tokens, closer to a real reply than the
fixture's one-line replies.

| Turns per batch | Batches | Input tokens | Cost  | Serial time | Cost at 400-token turns |
| --------------- | ------- | ------------ | ----- | ----------- | ----------------------- |
| 4               | 5,000   | 10.8 M       | $2.14 | 5.9 h       | $3.56                   |
| 20              | 1,000   | 2.9 M        | $1.07 | 2.3 h       | $2.49                   |
| 40              | 500     | 1.9 M        | $0.94 | 1.9 h       | $2.35                   |

The fit holds the full item list, at most 20 items here. A backfill grows the store to hundreds of
items, so it needs the writer's recall to send only the relevant ones; at about 20 tokens an item,
20 retrieved items add about $0.40 to the 4-turn backfill.

## Recommendation

Build Memory 1's writer on Haiku 5.5 at low effort with the default triggers, and run the backfill
through the same 4-turn batches. A year of history then costs $2.10 to $3.60 and about 6 hours in
the background. Larger batches save about $1 and 4 hours, but in 5 of 6 samples they lost a fact
that 4-turn batches kept or left 2 contradicting items, and a dollar does not pay for that. The
backfill resumes from the committed cursor after a crash, as the
[batch boundaries](../../memory/writes.md#batch-boundaries-and-recovery) require, so its length
needs no special handling.

## Limits

- The conversation is short, scripted and explicit. Real messages hold vaguer facts, longer replies
  and more pasted text, so 14 of 15 is an upper bound on capture, not a forecast.
- The checker model never ran. "Applied" means the candidate passed the quote and token checks; a
  checker call per candidate adds the `checker` role's cost and delay.
- JSON output stands in for the memory tools, and the host sends every active item instead of a
  recall. The tool round trips of a real writer add input tokens that this run does not count.
- The cost is Claude Code's request shape on a subscription token. A writer that sends the batch
  text without a cache write pays the input price instead of twice it, about a quarter off a batch.
- The backfill figures extrapolate from 42 batches of one conversation. Rate limits on the
  subscription can stretch the serial time.
