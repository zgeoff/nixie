# Spike: retrieval on nixie-shaped memory

This spike compares keyword search, SQLite FTS5 with BM25 ranking, vectors from a small local
embedding model, and BM25 fused with vectors, over 276 synthetic memory items and 75 questions. It
times the in-memory FTS5 index that the
[event log design](../../docs/design/platform/core/event-log.md#memory-history-and-export) requires
for free text that can be shredded. A second measurement takes the shipped per-turn retrieval to one
deployment's own conversations and tunes its settings.

## Question

At personal scale, does ranked full-text search beat plain keyword search, and do embeddings add
enough to earn an index and a model? Does the answer change between the user's message as typed and
the keywords a model passes to the recall tool? On real turns, does any encoder, ranking, floor or
item count find more of what a turn needed than the shipped settings? What does each memory block
add to a turn, and what does a short message bring?

## Answer

- Every method found every lexical question: recall@5 of 1.00 on each method and form.
- Paraphrase splits them: from the user's message, keyword search and BM25 found 18 to 22% of
  paraphrase gold items, and vectors found 52 to 68%.
- The recall tool's keywords matter more than the ranking: they lifted keyword search from 0.55 to
  0.76 at recall@5, close to MiniLM vectors on the message at 0.77.
- No method tells a current fact from a superseded one, so the store has to.
- An in-memory FTS5 index over 20,000 log messages builds in 62 ms and takes 0.85 ms per query.
- On 111 labelled real turns, the shipped hybrid ranking scored recall@5 0.539, recall@10 0.709 and
  MRR 0.509. No alternative encoder, fusion setting, floor or item count was shown to be better, and
  BM25 alone scored about 0.1 lower beyond its 95% interval.
- On a later snapshot, the memory blocks added about 170 tokens a turn, and the past messages showed
  on 801 of 1,056 hybrid turns. On the 266 labelled turns, the past messages scored a precision of
  0.03.
- On a held-out half of the 266 turns that the assistant labelled, similarity 0.46 with a BM25 floor
  of 2 showed 31% fewer items on turns that needed none, and lost no needed item on the 18 turns
  that needed an item the session lacked. The selection half agreed. A query window added noise, and
  the BM25 weight changed nothing on turns that needed none. On 274 of the 286 labels, recovered
  from the rater's replies, the same setting reached fresh recall 0.778 against 0.889 for shipped,
  so the no-loss result is unconfirmed.

Let the store mark which fact is current. Keep the shipped encoder and fusion. The
[per-turn options](per-turn-memory.md#options) give the floor and filter changes that the labels
support.

## Run it

```bash
bun install
bun run.ts
```

The [setup](results.md#setup) gives the versions, the models, the data and how each method ranks.
The [real-turn setup](real-turns.md#setup) gives the commands for a deployment's own turns.

## Results

The [results](results.md) hold the recall table for every method and form, the findings, and the
cost table. The [real-turn results](real-turns.md) hold the ranking, floor and item-count tables on
a deployment's own turns. The [per-turn memory results](per-turn-memory.md) hold the tokens and
noise of each block, and the fixes scored on a held-out half.

## Untested

Keywords from a model that has not seen the items, and a second rater beside the live assistant. The
[untested list](results.md#untested), the [real-turn list](real-turns.md#untested) and the
[per-turn list](per-turn-memory.md#untested) give the rest.
