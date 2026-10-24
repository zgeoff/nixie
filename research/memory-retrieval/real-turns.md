# Spike results: retrieval on real turns

This run measures nixie's shipped per-turn retrieval on one deployment's own conversations instead
of the synthetic items in [the main results](results.md). It rebuilds each conversation turn from
that deployment's event log: the user's messages that started the turn, the store as it stood when
per-turn retrieval ran, and what the retrieval returned. It then ranks the rebuilt store under the
shipped settings and under each alternative, and scores the rankings against labels that mark the
items each turn needed. The shipped encoder, fusion, floors and item counts score as well as every
alternative, so they stay.

The data is the user's own and never enters the repo. The harness reads a plain export of the data
directory from a folder given on the command line, and prints counts and scores only.

## Question

On the user's own turns, how much of what a turn needed does per-turn retrieval find, and does any
encoder, ranking, floor or item count find more without showing more noise?

## Setup

Run the commands from the spike's directory, with `<plain>` the folder that holds the plain export,
as [the export reader](real-turns/read-plain-export.ts) describes, and `<names>` a file that holds
the user's and the agent's names, one a line, which per-turn retrieval strips from the query. The
shipped encoder's files come from `bun run models` at the repo root, and the other encoders download
into `MODELS_DIR`.

```bash
bun real-turns.ts stats  --plain <plain>
bun real-turns.ts replay --plain <plain> --names <names>
bun real-turns.ts sample --plain <plain> --out <sample.jsonl> --size 300
bun real-turns.ts cases  --plain <plain> --labels <labels.jsonl> --key <sample-key.jsonl> --out <cases.jsonl>
bun real-turns.ts score  --plain <plain> --names <names> --labels <labels.jsonl> --key <sample-key.jsonl> \
  --encoders leaf-ir-q8,arctic-s-q8,bge-small,minilm
```

- [build-turn-cases.ts](real-turns/build-turn-cases.ts) rebuilds each turn, and follows the session
  replay that keeps a version the session was already given out of the turn's retrieval.
- [rank-turn.ts](real-turns/rank-turn.ts) ranks one turn through nixie's own keyword index, vector
  index and fusion, and through the same steps with each setting open.
- [load-turn-encoder.ts](real-turns/load-turn-encoder.ts) loads the shipped encoder through the
  product adapter and 3 alternatives through transformers.js.
- [score-turns.ts](real-turns/score-turns.ts) holds the runs and the scores.

Replaying the shipped settings on the rebuilt turns matched the logged retrieval on 662 of 669
turns. The rest differ by an item near a floor or a session reset the log does not mark.

### Data and labels

The snapshot held 1,003 conversation turns over 12 days and 99 memory items. Hybrid retrieval ran on
669 of those turns, and 593 of the 669 returned no item. On 666 of the 669, the session had already
been given at least one version, which per-turn retrieval leaves out, and that exclusion empties
most retrievals: on the 300 labelled turns, turning it off raises the items shown from 1.12 a turn
to 4.37.

The ratings could not serve as ground truth: the log held 4 rating records with 8 ratings, all
noise. Labels came instead from a Claude model given the deployment's persona and session prompt, on
a sample of 300 turns: the 213 turns whose retrieval returned an item or was rated, and 87 more at
random. The labeller saw the turn, the 2 exchanges before it, the reply, and every item the store
held at that moment, and marked each item that would have helped the reply. It marked at least one
item on 112 turns.

## Ranking

Each ranking puts every unpinned item in the store at the turn's moment in one list, with no floor
and no session exclusion, and scores it on the 112 turns that needed an item. Recall@k is the share
of the needed items in the top k, averaged over turns, and the last 2 columns give the paired
difference from the shipped ranking with its 95% bootstrap interval.

| Run                           | Recall@3 | Recall@5 | Recall@10 | MRR   | Recall@5 change           | MRR change                |
| ----------------------------- | -------- | -------- | --------- | ----- | ------------------------- | ------------------------- |
| Shipped: leaf-ir int8, hybrid | 0.476    | 0.543    | 0.712     | 0.494 | none                      | none                      |
| leaf-ir int8, vectors only    | 0.426    | 0.520    | 0.712     | 0.453 | -0.023 (-0.091 to 0.057)  | -0.041 (-0.094 to 0.016)  |
| BM25 only                     | 0.391    | 0.445    | 0.512     | 0.401 | -0.098 (-0.161 to -0.049) | -0.093 (-0.142 to -0.046) |
| leaf-ir, full width in fp32   | 0.463    | 0.539    | 0.717     | 0.484 | -0.004 (-0.013 to 0)      | -0.010 (-0.029 to 0.007)  |
| Fusion rank offset 20         | 0.467    | 0.555    | 0.703     | 0.493 | 0.012 (0 to 0.039)        | -0.001 (-0.004 to 0.003)  |
| Vector list weighted twice    | 0.448    | 0.551    | 0.717     | 0.487 | 0.007 (-0.024 to 0.055)   | -0.007 (-0.027 to 0.014)  |
| arctic-embed-s int8, hybrid   | 0.476    | 0.515    | 0.712     | 0.491 | -0.028 (-0.085 to 0.040)  | -0.003 (-0.043 to 0.046)  |
| bge-small fp32, hybrid        | 0.536    | 0.580    | 0.715     | 0.523 | 0.036 (-0.007 to 0.080)   | 0.029 (-0.025 to 0.086)   |
| bge-small fp32, vectors only  | 0.456    | 0.603    | 0.755     | 0.477 | 0.060 (-0.027 to 0.134)   | -0.017 (-0.102 to 0.060)  |
| MiniLM fp32, hybrid           | 0.454    | 0.513    | 0.691     | 0.496 | -0.031 (-0.093 to 0.024)  | 0.002 (-0.044 to 0.050)   |

The 3 alternative encoders keep every number of their vectors, because only the shipped model is
trained to carry its meaning in the first 256.

## Floors and item count

Each served run shows a turn what per-turn retrieval would: up to the item count of facts and 2 self
notes, above both floors, with the session's earlier versions left out. Fresh recall is the share of
needed items the session had not been given yet that the turn shows, over the 37 turns that had such
an item. The last 3 columns cover the 188 labelled turns that needed no item.

| Run                                          | Fresh recall | Shown on a turn that needs none | Such turns shown any | Precision |
| -------------------------------------------- | ------------ | ------------------------------- | -------------------- | --------- |
| Shipped: 5 items, similarity 0.38, BM25 0.25 | 0.919        | 0.95                            | 0.38                 | 0.107     |
| 3 items                                      | 0.919        | 0.76                            | 0.38                 | 0.134     |
| 8 items                                      | 0.946        | 1.13                            | 0.38                 | 0.092     |
| Similarity 0.34                              | 0.919        | 1.17                            | 0.40                 | 0.091     |
| Similarity 0.42                              | 0.838        | 0.83                            | 0.36                 | 0.109     |
| BM25 floor 2                                 | 0.865        | 0.81                            | 0.33                 | 0.117     |
| Vectors only, similarity 0.38                | 0.703        | 0.53                            | 0.22                 | 0.135     |
| Shipped floors, no session exclusion         | 0.757        | 4.18                            | 0.93                 | 0.057     |

The shipped run showed 8 of the 8 items rated noise again, and the vectors-only run showed 1 of
them, because BM25 matched the rest.

## Answer

The shipped settings stay, because no alternative beat them beyond its interval:

- **Encoder:** `MongoDB/mdbr-leaf-ir` int8, its first 256 numbers stored as int8. Full width in fp32
  scored the same, and bge-small, the best alternative, gained 0.036 recall@5 with an interval that
  crosses zero, so a model swap is not supported.
- **Ranking:** BM25 and vectors fused by reciprocal rank with offset 60 and equal weight. BM25 alone
  loses about 0.1 of recall@5 and of MRR beyond its interval, and vectors alone score 0.04 lower on
  MRR within theirs, so fusion keeps both lists. The offset and the weight move recall@5 by 0.012 at
  most.
- **Floors:** `retrieval_min_similarity` 0.38 and `retrieval_min_score` 0.25. A lower similarity
  floor shows more items on turns that need none with no gain in fresh recall, and a higher one, or
  a higher BM25 floor, loses fresh recall.
- **Item count:** `retrieval_items` 5 and `retrieval_self_notes` 2. Within a session, 3 items keep
  the same fresh recall as 5 and show 0.19 fewer items on a turn that needs none. On a store with
  nothing delivered, as after a new session or a compaction, ranks 4 and 5 add 0.067 to recall, so
  the count stays at 5.

Precision stays near 0.11 under every floor: most items a turn is shown are not ones it needed, and
38% of the turns that need none are shown at least one. No floor separates the two, so a better
precision needs a signal beyond the ranking, such as a reranker or a model's judgement of the top
results.

## Untested

- Labels from the deployment's live assistant. The labeller is a Claude model given its persona and
  session prompt, and it saw every item at once, which the live turn never does.
- More than one deployment, and more than the 37 labelled turns whose needed item the session had
  not been given yet, which bound the floor and item-count comparisons.
- The self-note count and the past messages placed beside the items, which these runs hold at their
  shipped settings.
- A cross-encoder or a model reranking the top results.
