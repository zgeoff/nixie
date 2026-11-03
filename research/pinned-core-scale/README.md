# Spike: the pinned core at scale

This spike checks whether the conversation's model follows the pinned-core change note when the core
is full, and in a session that runs for days. It runs each turn through the conversation guest's own
turn code, with invented memory items, on the Claude subscription, so its runs spent no API money.
[Memory in context](../../docs/architecture/memory/context.md#the-pinned-core) describes the change
note it tests.

## Questions

1. Does the model follow a change note when the pinned core is full?
2. Does it still follow one in a session that runs for days, or does a long session need the core
   sent again?

## Answer

- With 41 pinned items at 1,970 of the 2,000-token budget, Opus 5.5 at medium effort followed the
  note in 5 of 5 trials, on the note's turn and on the 2 turns after it.
- In one session open for 10 days, the model followed all 4 notes on every later turn, and followed
  the first note 10 days and 23 turns after it. The run gives no reason to send the core again in a
  long session.
- On 7 of the 9 turns that carried a note, the reply named the old value beside the new one, each
  time to correct the model's own earlier answer.
- The 2 runs came to $0.63 at list prices, which the subscription makes notional.

## Run it

Run from this directory, on a host whose egress adds the Claude subscription credential, such as an
imp sandbox. The guest holds a placeholder token, as it holds a placeholder key in production. Each
script takes a spending limit in list-price dollars, and starts no trial or turn once its spend
reaches it.

```bash
bun install
bun full-core.ts 5 5
bun long-session.ts "$(mktemp -d)" 3 5
```

The [setup](results.md#setup) gives the versions, the fixtures and each run's turns.

## Results

The [results](results.md) hold each run's table, the sleep gaps of the long session, and the token
cost of a note.

## Untested

Days between a later note and the turns after it, because a 9.5-day host sleep put 3 of the 4 notes
and every turn after them within 2 minutes. The [untested list](results.md#untested) gives the rest.
