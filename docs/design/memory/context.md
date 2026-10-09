# Memory in context

- Status: Proposed
- Decisions: [0001](../../decisions/0001-durable-layer.md),
  [0010](../../decisions/0010-memory-store.md),
  [0013](../../decisions/0013-definition-versioning.md),
  [0024](../../decisions/0024-memory-in-context.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md),
  [0027](../../decisions/0027-tasks-and-outside-actions.md)

The conversation runs on the Agent SDK's session and compaction, under
[0024](../../decisions/0024-memory-in-context.md). nixie places memory in it 3 ways: a small pinned
core in the system prompt, a few items retrieved for each turn and placed in the newest turn, and 2
recall tools the model calls when it needs more. Retrieval searches memory items and past
conversation in the event log, with local semantic embeddings and keyword lookup from indexes held
in memory. A compaction summary stays in the session and never becomes memory. The SDK's own
transcript is a cache that the event log supersedes. Everything in this doc beyond the decisions it
links is a proposal.

## The prompt

Each turn's prompt runs from the most stable part to the least, so the prompt cache holds:

1. **The system prompt:** nixie's instructions, the persona fixed for the task's life under
   [0013](../../decisions/0013-definition-versioning.md), and the pinned core.
2. **The session:** every earlier turn, or the compaction summary and the turns kept after it.
3. **The newest turn:** the task's inbox records, the task board for the conversation, and the
   retrieved items.

nixie runs the SDK with `settingSources: []`, so no settings file on disk applies, and passes its
own settings through the `settings` option of `query()`, which loads them into the SDK's flag layer.
The SDK's own memory is switched off there: `autoMemoryEnabled: false` and
`autoDreamEnabled: false`. **Why:** the SDK version 0.3.293 that the spikes use ships an auto-memory
directory, a recall supervisor that puts its files into turns, and a background consolidation, which
together would make a second memory store with no provenance and no review. A test asserts that
every `query()` nixie starts passes both flags. The compaction settings below and
`cleanupPeriodDays` go through the same option.

## The pinned core

The pinned core is the set of items the owner pins, such as the owner's name and pronouns, which the
model-eval spike found every model needs
([2.4 to 2.6 landscape](../../research/2.4-2.6-data-channels-connectors.md#memory)). nixie renders
it into the system prompt as a list of items, each with its ID, in pin order.

The core's budget is 2,000 tokens by default, and the owner can change it. The memory view shows the
core's size against the budget, and pinning past it asks the owner to unpin something first.
**Why:** the core rides in the cached prefix of every turn of every task, so each turn pays the
cache-read price on it, and every change to it costs one cache write per live session; 2,000 tokens
holds dozens of short facts while staying a small share of a turn. nixie measures the core's real
cost with `getContextUsage()` on the [pinned core spike](../../../spikes/sdk-pinned-core/README.md)
and the owner's own memory before the budget is final.

The SDK records a session's system prompt on its first request and reuses the record, ignoring a
changed prompt on a later resume until the session compacts, unless the caller sets
`snapshot: false` (SDK 0.3.293, `systemPrompt.snapshot`). A pinned core in the system prompt would
then reach a running conversation only at its next compaction. nixie therefore sets
`snapshot: false` for every session, and builds the system prompt on each `query()` from the persona
version the task pinned and the current core. A core that has not changed renders the same bytes, so
the cache holds; a change breaks the cache once. **Why:** an item the owner pins or edits must reach
the conversation on its next turn, and persona changes still wait for a new task, because the task
pins its persona version, not because of the SDK's record.

Whether `snapshot: false` re-renders on a resume, and what a change costs in cache writes, is
unverified: the [pinned core spike](../../../spikes/sdk-pinned-core/README.md) is written and waits
on a model call. If the record holds regardless, the fallback is to fork the session at its last
boundary when the core changes, which writes a new session ID that renders the prompt afresh.

## Retrieval

The owner agreed local embeddings in the first build, with keyword lookup retained. This refines
0024's earlier keyword-first route; the memory module's decision record captures the amendment once
its remaining owner choices are settled. Per-turn retrieval and the recall tools use the same
retrieval service over readable active memory items and eligible past messages.

A small local encoder produces semantic vectors for natural-language queries. It uses pinned local
model assets and makes no inference API call or query-time model download. SQLite FTS5 with BM25
remains available for word, name and reference lookup; an exact item-ID request reads the canonical
item directly. Ranking and any combination of the two signals are configurable and validated on the
owner's questions. The synthetic spike does not establish that fusion is better than semantic
ranking alone.

### The index

At start, nixie builds an FTS5 table in an in-memory SQLite database, with the porter tokenizer, and
a semantic vector index in process memory. Both derive from the active memory items and the owner
messages and model replies whose keys remain readable. The embedding model runs on the host as a
text encoder, not as an agent with tools or grants.

Every entry carries its canonical item ID and version, or its record ID and sequence, together with
the encoder revision and index generation. The host loads the encoder's pinned assets before it
publishes a ready semantic generation; it never mixes vectors from different model revisions or
dimensions. A model change builds a fresh generation and swaps it in as a unit. Keyword lookup
remains available while the semantic generation rebuilds; the retrieval result records that it used
keyword-only fallback, so reduced capability is visible rather than silent.

A canonical write commits an index-invalidation record with the item or log record. After that
commit, the retrieval service removes an old entry and queues the current readable version for
encoding. No model computation holds the database write transaction open. When an encoding finishes,
the service re-checks the version, active state, key availability and index generation; it discards
work that belongs to an older revision, a retired or forgotten item, or an old model. This handles a
write or forget that races with a background encoding.

The indexes rank candidate IDs; they never supply authoritative result text. Before returning any
candidate, the retrieval service reads its current canonical version, checks that it is eligible and
can decrypt it, and discards a version mismatch. It fills the final result only from those validated
rows. A stale index entry cannot return content that was retired, superseded or forgotten.

Retire and forget invalidate both indexes and their cached candidates. Forget waits for those
entries to be removed and pending results to be invalidated before its checked action completes.
Neither the FTS5 index nor the semantic vectors or query caches are written to disk, exported or
backed up; model weights contain no owner text. Restart rebuilds derived indexes from readable
records. **Why:** the [shredding spike](../../../spikes/memory-shred/README.md) found that a
persisted FTS5 index retains forgotten words, and derived retrieval data must follow the same forget
boundary as the records it represents. This is an index lifecycle contract, not a claim that every
transient process-memory copy has been physically zeroed.

Tool results, worker transcripts and compaction summaries stay out of the index. **Why:** they are
outside content or text the model wrote from it, so retrieving them into a later turn would place
that text beside the owner's own words, and they are the bulk of the log.

The [retrieval spike](../../../spikes/memory-retrieval/README.md) measured the cost: the index over
276 items built in 1.7 ms, and over 20,000 messages, 5.1 MB of text, in 62 ms, using 11 MB of
memory. A query over 20,000 messages took 0.85 ms. Building the index at every start is therefore no
obstacle at personal scale.

### Per-turn retrieval

Before each turn, nixie searches the index with the text of the owner's new messages in the inbox,
or the task's brief on a task's first turn. It places up to 5 memory items and up to 3 past messages
above a score floor in the newest turn, all 3 numbers configurable. Each retrieved entry carries its
ID, version or record sequence, source and date, inside a block that labels them as stored items,
not instructions. Pinned items, which the system prompt holds, and messages still in the session's
context stay out. The turn's record lists every item and version it placed, as the
[event log design](../core/event-log.md#memory-history-and-export) requires.

### The recall tools

The model searches further with 2 tools:

- **`memory.recall`** returns memory items, as [the store](./store.md#recall) covers.
- **`log.search`** returns past owner messages and replies word for word, each with its thread, its
  record sequence and its date. It declares `read`.

Both accept the model's natural-language query for semantic recall and retain keyword lookup for
specific words, names and references. Their descriptions expose the available search paths and
return provenance for the same canonical rows. Neither a semantic score nor a keyword match is
evidence that a memory is current; the active-state and version checks decide that.

### What the retrieval spike found

The spike ran 75 questions over 276 synthetic memory items, each question in 2 forms: the owner's
message as written, and keywords as a model would pass them to `memory.recall`. Recall at 5:

| Method          | Owner's message | Keywords | Paraphrase, from the message |
| --------------- | --------------- | -------- | ---------------------------- |
| Keyword overlap | 0.55            | 0.76     | 0.22                         |
| FTS5 BM25       | 0.58            | 0.73     | 0.18                         |
| Vectors, MiniLM | 0.77            | 0.85     | 0.68                         |
| BM25 and MiniLM | 0.73            | 0.84     | 0.58                         |

Every method found every question that shared a word with its item. The methods parted only on
paraphrase, such as "who is my doctor?" against an item that holds "GP": words alone found about a
fifth of those from the owner's message, and a small local embedding model found about two thirds.
Hand-written keywords closed most of that gap for keyword search, at 0.76 against 0.77 for vectors
on the raw message. Their author could see the items, so this is not a blind model-keyword result.
BM25 found no more than plain keyword overlap and ranked the right item higher.

The spike's data is synthetic and written by one author, so its measured recall is not a claim about
the owner's memories. Local embeddings are an agreed first-build feature; the
[retrieval run on the owner's questions](../open-items.md#spikes-to-run), with keywords from a model
that has not seen the items, validates and tunes that feature instead of deciding whether it exists.
The small CPU encoders in the spike are candidate implementations, not an agreed final model choice.
A selected encoder must pass the same version, provenance and forget checks.

No ranking told a current fact from one it superseded: the old version came first about half the
time. Retrieval therefore searches only active items, and a memory write that replaces a fact
revises its item or retires the old one, as [memory writes](./writes.md#who-writes) asks of the
writer.

## Compaction

The SDK compacts a session when its context fills, and nixie keeps that behaviour, under 0024. SDK
0.3.293 offers these controls:

| Control                       | Kind         | nixie's setting                             |
| ----------------------------- | ------------ | ------------------------------------------- |
| `autoCompactEnabled`          | Setting      | On                                          |
| `autoCompactWindow`           | Setting      | 200,000 tokens by default, configurable     |
| `idleCompaction`              | Setting      | Off                                         |
| `precomputeCompactionEnabled` | Setting      | Off                                         |
| `PreCompact` hook             | Hook         | Records that compaction started             |
| `PostCompact` hook            | Hook         | Records the summary                         |
| `compact_boundary` message    | Stream event | Records tokens before and after             |
| `getContextUsage()`           | Query method | Reads the window, the threshold and the use |

Idle compaction and precomputed compaction both stay off. **Why:** a step's commit records the
session's last chain entry as the boundary that crash recovery resumes at, under
[tasks](../core/tasks.md#crash-recovery), so the session must change only inside a step that holds
the task's lease. An idle compaction would change it with no step and no record. The window of
200,000 tokens is the SDK's boundary for models with a 1M window, and it keeps every turn's cached
prefix to a size whose cost the owner can predict.

The `PostCompact` hook gives the summary text, and nixie writes it as a `session_compacted` record
with the token counts, encrypted under a per-record key like any free text. The live view shows it,
so the owner can read what the model now remembers of the conversation. The summary never becomes
memory, under 0024, and retrieval never searches summaries. **Why:** the model wrote the summary
from an untrusted conversation, so retrieving it into a later turn would launder that text into a
trusted-looking place.

The `PreCompact` hook's output carries no field that steers what compaction keeps, so nixie cannot
shape the summary through it. Whether returning `decision: 'block'` from it stops an automatic
compaction is unverified, and nixie does not rely on it. A session that compacts between a step's
boundary and a crash is untested by the [resume-at spike](../../../spikes/sdk-resume-at/README.md),
and is a [spike to run](../open-items.md#spikes-to-run).

## The SDK transcript

The SDK writes each session's transcript as JSON lines under `CLAUDE_CONFIG_DIR`, inside the imp
that runs the session under [0026](../../decisions/0026-where-workers-and-the-conversation-run.md).
The second [decision for the owner](./store.md#decisions-for-the-owner) recommends treating the
transcript as a cache that the event log supersedes:

- **Not a store.** nixie never backs up or exports a transcript. The event log holds every owner
  message, reply, tool call, tool result and compaction summary, so the log export from the
  [event log design](../core/event-log.md#memory-history-and-export) gives the owner everything the
  transcript holds in a form they can read.
- **Kept while a task lives.** nixie sets `cleanupPeriodDays` high enough that the SDK never sweeps
  a session nixie still resumes, and deletes a task's sessions when the task closes. **Why:** the
  SDK deletes transcripts after 30 days by default, and a task that waits on the owner for longer
  than that must still resume.
- **Rebuilt when lost.** A missing or unusable transcript, such as after an imp's disk is lost,
  makes the next step rebuild the session, as [rebuilding a session](#rebuilding-a-session) covers.

The SDK can mirror a transcript to a store of the caller's through its `sessionStore` option, and
load it from there to resume. nixie does not use it in the first build. **Why:** the option is
marked alpha in SDK 0.3.293, and its adapter runs in the SDK's process inside the imp, so it would
need a write route from the imp to the host for every transcript entry.

### Rebuilding a session

A rebuild starts a new session from the log instead of resuming the old one. Its first turn carries
the task's brief, the most recent turns of the thread word for word from the log up to 30,000 tokens
by default, and the latest compaction summary from before those turns. Forgotten records and items
leave gaps, and a summary written after a forgotten record is dropped, because it may hold the
forgotten content. nixie records the new session ID on the task as crash recovery does.

A rebuild costs one turn at full input price and every turn older than the window, apart from what
the summary keeps. The live view marks the rebuild in the thread.

### Forgetting and the live session

A forgotten record or memory item can still sit in a live session's context, in a turn that read it
or in a summary written after it. nixie therefore tracks, per task, the records and memory items its
session has read, from the recall lists and inbox reads on each turn's record. Forgetting one that a
live session read marks that session for rebuild, and the task's next step rebuilds before it runs.
**Why:** "forget" under [0010](../../decisions/0010-memory-store.md) must mean the model stops
seeing the item, not only that the database stops holding it.
