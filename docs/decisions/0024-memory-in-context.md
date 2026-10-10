# 0024: How memory reaches the model

- Date: 2026-10-08
- Status: decided, amended by [0031](./0031-memory-capture-context-and-removal.md)
- Research:
  [memory notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.4-notes/memory-models.md),
  [2.4 to 2.6 landscape](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.4-2.6-data-channels-connectors.md#memory)

The conversation runs on the Agent SDK's session and compaction, with the stable part of the prompt
first so the prompt cache holds. nixie adds retrieval over memory and over the event log, which
holds past conversation word for word: the recall tool from [0010](./0010-memory-store.md), and a
few retrieved items placed in the newest turn with their provenance. Retrieval starts with keyword
search, and embeddings follow where a measurement on nixie's own memory shows a gain. A compaction
summary stays in the session and never becomes memory.

## Why

- A prompt cache matches on the unchanged start of the prompt, so rebuilding the context each turn
  would pay full input price every turn. Items that change each turn go last.
- The event log already holds every turn, so past conversation needs no extra memory writes or
  cleanup.
- Independent work found plain search matching or beating vector retrieval on conversational recall:
  grep scored 83.6 to 93.1% against 62.9 to 83.6% for vector retrieval on a LongMemEval subset
  ([Sen et al., arXiv 2605.15184](https://arxiv.org/abs/2605.15184)), and vendor scores are
  self-reported.
- The model writes a compaction summary from an untrusted conversation, and poisoning through
  compaction succeeded in 85.17% of cases in one study (MPBench, Dash et al., 2026-06-03), so a
  summary takes no path into memory except the checks in [0011](./0011-memory-writes.md).

## Alternatives

- **Build the context fresh each turn.** It loses the prompt cache, at roughly 10 times the cost of
  a cached turn on a long context.
- **Store short-term conversation as memories.** It fills memory with noise that needs cleanup, when
  the event log already holds the conversation.
- **Embeddings from the start.** They add an index and a model before a measurement shows they help.

## Consequences

- Phase 3 checks which compaction controls the SDK offers, and how large the pinned core can grow
  before the prompt pays for it.
