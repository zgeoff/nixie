# Spike results: the memory each turn brings

This measurement follows [retrieval on real turns](real-turns.md) on a later snapshot of the same
deployment. It counts what each memory block adds to a turn, tests rules for short messages and for
the past-messages block, and scores them on labels from the deployment's own assistant. The data is
the user's own and never enters the repo: the harness reads a plain export from a folder outside it
and prints counts and scores only.

Each sentence that states a fact ends with how it is known: [measured] for a harness command on the
snapshot, [read in the code] for the product code, and [from a record] for an earlier report.

## Questions

1. How many tokens does each block add per turn, and which block carries most of the noise? This
   informs which block to cut or gate first.
2. For a short message, does skipping retrieval, querying with the previous exchange, or asking the
   keyword and vector lists to agree cut the noise without losing the hits? This informs the
   retrieval rule for short messages.
3. Does the past-messages block help any turn? This informs whether it stays, gets a high floor, or
   goes.
4. What precision and fresh recall do the candidate settings reach on labels from the assistant?
   This informs the shipped settings.

## Setup

Run the commands from the spike's directory, with the same `<plain>` and `<names>` as
[the real-turn setup](real-turns.md#setup), and `<out>` a folder outside the repo for the sample.

```bash
bun real-turns.ts blocks --plain <plain>
bun real-turns.ts rating-sample --plain <plain> --names <names> --out <out> --size 286
bun real-turns.ts score --plain <plain> --names <names> --labels <out>/labels --key <out>/sample-key.jsonl \
  --sample <out>/sample.jsonl
```

- [count-turn-blocks.ts](real-turns/count-turn-blocks.ts) renders each block through the product's
  own renderers and counts it at 4 characters a token, the count the product budgets with.
- [pick-turn-query.ts](real-turns/pick-turn-query.ts) holds the short-message rules, and
  [pick-rating-turns.ts](real-turns/pick-rating-turns.ts) and
  [build-rating-sample.ts](real-turns/build-rating-sample.ts) build the sample.
- [score-blocks.ts](real-turns/score-blocks.ts) scores what each block showed, and
  [score-message-floors.ts](real-turns/score-message-floors.ts) the similarity floors on the past
  messages shown.

### Data

The snapshot held 25,533 records over 24 days, 151 memory items and 254 versions [measured]. It
rebuilds 1,401 conversation turns, and hybrid retrieval ran on 1,056 of them [measured]. From 16
Oct, each conversation turn record lists the past messages its turn was shown: 1,056 of the 1,439
records do, and the 383 before that date do not [measured]. The deployment sets `retrieval_messages`
to 1 and keeps every other memory setting at its default [from a record]. Replaying the shipped
settings matched the logged retrieval on 1,047 of the 1,056 hybrid turns, and on 144 of the 153 that
returned an item [measured].

## Tokens per block

Each count covers the 1,056 hybrid turns [measured]. Pinned memory goes only into a session's
opening, so it counts on the 8 turns that opened a session [read in the code].

| Block           | Turns with it | Tokens when present | 90th percentile | Tokens per turn |
| --------------- | ------------- | ------------------- | --------------- | --------------- |
| Pinned memory   | 8             | 336                 | 507             | 2.5             |
| Retrieved items | 146           | 426                 | 794             | 59              |
| Self notes      | 60            | 308                 | 523             | 17              |
| Past messages   | 801           | 124                 | 208             | 94              |
| Task board      | 31            | 209                 | 209             | 6.1             |

A model call read a median of 155,714 input tokens, cached or not, so the blocks a turn adds come to
about 0.1% of one call [measured]. A block stays in the session once given, and a session held a
median of 19,142 memory tokens at a hybrid turn, with a maximum of 35,335 [measured]. That count
resets only when a session opens, and 3 compactions do not reset it, so it is an upper bound
[measured].

## Short messages

A message counts as short at 3 words or fewer, where a word is a run of letters or digits, so an
emoji alone counts as none [read in the code]. 98 of the 1,056 hybrid turns are short [measured].
The counts below cover every hybrid turn and need no labels [measured].

| Setting on a short message     | Short turns shown an item | Items per short turn | Other turns shown an item |
| ------------------------------ | ------------------------- | -------------------- | ------------------------- |
| Shipped                        | 5                         | 0.15                 | 146                       |
| Skip retrieval                 | 0                         | 0                    | 146                       |
| Query with previous exchange   | 23                        | 0.81                 | 146                       |
| Keyword and vector lists agree | 1                         | 0.02                 | 146                       |
| Vectors only                   | 2                         | 0.04                 | 146                       |

The question assumed that short messages pull in unrelated items, and on this snapshot they rarely
do: the shipped setting showed an item on 5 of the 98 short turns [measured]. The session exclusion,
which leaves out what the session was already given, does most of that work: with it off, the same
floors show items on 59 of the 98 short turns, 2.2 a turn [measured]. The past-messages block shows
on 77 of the same 98 turns, so on a short message it is the block the assistant sees [measured].
Querying with the previous exchange shows items on 18 more short turns, so it adds volume where the
complaint is volume [measured]. With short set at 6 words, every rule changes the count of other
turns shown an item by 15 or fewer [measured].

## Past messages

The past-messages block showed on 801 of the 1,056 hybrid turns, at a mean of 124 tokens [measured].
It is the largest block per turn, at 94 tokens against 59 for the retrieved items [measured]. The
deployment shows at most 1 past message a turn, and a message is shown at most once a session [read
in the code].

84 hybrid turns hold pasted text, and dropping it from the query shows items on 4 fewer turns in all
[measured].
