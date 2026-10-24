# Spike: retrieval on nixie-shaped memory

This spike compares keyword search, SQLite FTS5 with BM25 ranking, vectors from a small local
embedding model, and BM25 fused with vectors, over 276 synthetic memory items and 75 questions. It
times the in-memory FTS5 index that the
[event log design](../../docs/design/platform/core/event-log.md#memory-history-and-export) requires
for free text that can be shredded. A second measurement takes the shipped per-turn retrieval to one
deployment's own conversations and tunes its settings.

## Question

At personal scale, does ranked full-text search beat plain keyword search, and do embeddings add
enough to earn an index and a model? Does the answer change between the owner's message as typed and
the keywords a model passes to the recall tool? On real turns, does any encoder, ranking, floor or
item count find more of what a turn needed than the shipped settings?

## Answer

- Every method found every lexical question: recall@5 of 1.00 on each method and form.
- Paraphrase splits them: from the owner's message, keyword search and BM25 found 18 to 22% of
  paraphrase gold items, and vectors found 52 to 68%.
- The recall tool's keywords matter more than the ranking: they lifted keyword search from 0.55 to
  0.76 at recall@5, close to MiniLM vectors on the message at 0.77.
- No method tells a current fact from a superseded one, so the store has to.
- An in-memory FTS5 index over 20,000 log messages builds in 62 ms and takes 0.85 ms per query.
- On 112 labelled real turns, the shipped hybrid ranking scored recall@5 0.543, recall@10 0.712 and
  MRR 0.506. No alternative encoder, fusion setting, floor or item count was shown to be better, and
  BM25 alone scored about 0.1 lower beyond its 95% interval.

Let the store mark which fact is current. Keep the shipped encoder, fusion, floors and item counts.

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
a deployment's own turns.

## Untested

Keywords from a model that has not seen the items, and labels from the live assistant rather than a
language model given its persona. The [untested list](results.md#untested) and the
[real-turn list](real-turns.md#untested) give the rest.
