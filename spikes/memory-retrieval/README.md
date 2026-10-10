# Spike: retrieval on nixie-shaped memory

This spike compares 4 ways to find memory items for a question: keyword search, SQLite FTS5 with
BM25 ranking, vectors from a small local embedding model, and BM25 fused with vectors. It runs over
276 synthetic memory items for a fictional owner and 75 questions, and it times an FTS5 index held
in memory, as the [event log design](../../docs/design/core/event-log.md#memory-history-and-export)
requires for free text that can be shredded.

- Bun 1.4.2 with `bun:sqlite`, whose SQLite has FTS5 built in
- `@huggingface/transformers` 4.3.1 on `onnxruntime-node` 1.30.0, CPU only
- Models: `Xenova/all-MiniLM-L6-v2` and `Xenova/bge-small-en-v1.5`, fp32, mean pooling

## Question

At personal scale, does ranked full-text search beat plain keyword search, and do embeddings add
enough to earn an index and a model? Does the answer change between the owner's message as typed,
which per-turn retrieval searches with, and the keywords a model passes to the recall tool?

## Run it

Run the command from this directory. The first run downloads both models, about 215 MB, from Hugging
Face with no account.

```bash
bun install
bun run.ts
```

- [items.ts](./items.ts) holds the items: 166 facts about the owner, family, work, health, home,
  money, travel and projects, 17 of them superseded by a later item, plus 110 saved links, purchases
  and notes that share their vocabulary.
- [questions.ts](./questions.ts) holds the questions, each with the owner's message, the recall
  keywords and the gold item IDs, in 4 types: lexical (20), paraphrase (25), latest (15) and multi
  (15).
- [run.ts](./run.ts) runs every method on both forms and prints recall@5, recall@10 and mean
  reciprocal rank (MRR).

Keyword search counts the distinct query terms, after stop words, that occur in an item, as grep
would. FTS5 uses the `porter unicode61` tokenizer and an `OR` of the same terms. Vectors rank by
cosine over every item, and fusion is reciprocal rank fusion of the BM25 and vector lists.

## Answer

Scores are recall@5 over all 75 questions, with recall@5 per question type:

| Method             | Form     | All  | Lexical | Paraphrase | Latest | Multi | MRR  |
| ------------------ | -------- | ---- | ------- | ---------- | ------ | ----- | ---- |
| Keyword            | Message  | 0.55 | 1.00    | 0.22       | 0.67   | 0.37  | 0.46 |
| Keyword            | Keywords | 0.76 | 1.00    | 0.50       | 0.87   | 0.76  | 0.68 |
| FTS5 BM25          | Message  | 0.58 | 1.00    | 0.18       | 0.87   | 0.38  | 0.51 |
| FTS5 BM25          | Keywords | 0.73 | 1.00    | 0.46       | 0.87   | 0.67  | 0.70 |
| Vectors, MiniLM    | Message  | 0.77 | 1.00    | 0.68       | 0.87   | 0.54  | 0.67 |
| Vectors, MiniLM    | Keywords | 0.85 | 1.00    | 0.76       | 0.87   | 0.77  | 0.72 |
| BM25 and MiniLM    | Message  | 0.73 | 1.00    | 0.58       | 0.87   | 0.48  | 0.66 |
| BM25 and MiniLM    | Keywords | 0.84 | 1.00    | 0.78       | 0.87   | 0.72  | 0.78 |
| Vectors, bge-small | Message  | 0.67 | 1.00    | 0.52       | 0.73   | 0.44  | 0.63 |
| Vectors, bge-small | Keywords | 0.84 | 1.00    | 0.84       | 0.73   | 0.76  | 0.70 |
| BM25 and bge-small | Message  | 0.68 | 1.00    | 0.44       | 0.87   | 0.47  | 0.60 |
| BM25 and bge-small | Keywords | 0.87 | 1.00    | 0.84       | 0.87   | 0.77  | 0.76 |

- **Every method finds a question that shares a word.** Lexical questions scored 1.00 at recall@5 on
  every method and form.
- **Paraphrase is where the methods part.** "who is my doctor?" never matches "GP", and "my wife"
  never matches "Alex". Keyword search and BM25 found 18 to 22% of paraphrase gold items from the
  owner's message, and vectors found 52 to 68%.
- **The recall tool's keywords matter more than the ranking.** Moving from the owner's message to
  model-style keywords lifted keyword search from 0.55 to 0.76, close to vectors on the message at
  0.77. The keywords in this spike were written by hand with the items in view, so they flatter
  every method; a model writing keywords blind will do worse.
- **BM25 ranks better than keyword search but finds no more.** At recall@10 the two are within 2
  points, and BM25 has the higher MRR on both forms, because it weighs rare terms.
- **No method tells the current fact from a superseded one.** On latest questions, the current
  version reached the top 10 in up to 93% of questions, yet MRR stayed between 0.35 and 0.62: the
  superseded version ranked first about half the time. Ranking cannot settle which fact is current;
  the store has to.
- **Fusion adds little over vectors alone.** On the message form it scored within 4 points of
  vectors at recall@5, and on the keywords form it gave the best MRR, 0.76 to 0.78.

The costs are small at this scale:

| Measure                                         | Result                      |
| ----------------------------------------------- | --------------------------- |
| FTS5 build, 276 items, in memory                | 1.7 ms, 72 KB               |
| FTS5 build, 2,000 log messages, 0.5 MB of text  | 7 ms, 0.8 MB                |
| FTS5 build, 20,000 log messages, 5.1 MB of text | 62 ms, 8.2 MB, 11 MB of RSS |
| Query, keyword over 276 items                   | 0.03 ms                     |
| Query, FTS5 over 276 items                      | 0.01 ms                     |
| Query, FTS5 over 20,000 messages                | 0.85 ms                     |
| Model load from the local cache                 | 123 to 134 ms               |
| Embedding per item, one batch of 276            | 1.2 ms MiniLM, 2.6 ms bge   |
| Embedding per query                             | 0.8 ms MiniLM, 1.4 ms bge   |
| Disk: models and the ONNX runtime               | 215 MB and 288 MB           |

An in-memory FTS5 index costs about 1.6 times the text it covers and builds at about 80 MB of text a
second, so rebuilding it at start is no obstacle at personal scale.

## Untested

- **Questions the owner writes.** Every item and question here is synthetic, written by one author
  who saw the items, so the type mix and the scores carry that bias. The owner-written questions
  over the owner's own memory remain to run, and they decide whether embeddings earn their place.
- Keywords written by a model that has not seen the items.
- Retrieval over the event log's past conversation, beyond build and query time on synthetic text.
- A cross-encoder or a model reranking the top results.
- Embedding models beyond the 2 small English ones, and any embedding through an API.
- A larger store, such as a few thousand items after years of use.
- A recency signal, such as a newer date breaking a near tie, against superseded items.
