# 0024: How memory reaches the model

- Date: 2026-10-08
- Status: decided
- Design: [memory context](../design/memory/context.md)
- Research: [retrieval spike](../../spikes/memory-retrieval/),
  [memory notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.4-notes/memory-models.md)

The conversation runs on the Agent SDK's session and compaction, with the stable part of the prompt
first so the prompt cache holds. nixie adds retrieval over memory and over the event log, which
holds past conversation word for word: the recall tool from [0010](./0010-memory-store.md), and a
few retrieved items placed in the newest turn with their provenance. A compaction summary stays in
the session and never becomes memory.

Retrieval uses local embeddings and keyword search together. One retrieval service serves per-turn
retrieval and the recall tool. It searches active memory items and the past messages and replies
whose keys remain readable, and returns text only from current rows. The encoder runs on the host
from pinned local files, with no inference API call. While its index rebuilds, retrieval falls back
to keyword search and records the fallback. The encoder library is an open item.

## Why

- A prompt cache matches on the unchanged start of the prompt, so rebuilding the context each turn
  would pay full input price every turn. Items that change each turn go last.
- The event log already holds every turn, so past conversation needs no extra memory writes or
  cleanup.
- Your wording often differs from the stored fact, such as "doctor" against "GP". On synthetic
  paraphrases, keyword search found the relevant item in the top 5 results 18 to 22% of the time,
  against 68% for local embeddings. The gain on your own questions is unmeasured.
- A local encoder keeps memory text off any outside service.
- The model writes a compaction summary from an untrusted conversation, and poisoning through
  compaction succeeded in 85% of cases in one study, so a summary takes no path into memory except
  the checks in [0011](./0011-memory-writes.md).

## Alternatives

- **Build the context fresh each turn.** It loses the prompt cache, at roughly 10 times the cost of
  a cached turn on a long context.
- **Store short-term conversation as memories.** It fills memory with noise that needs cleanup, when
  the event log already holds the conversation.
- **Keyword search alone.** It needs no encoder or index, and misses paraphrases.
