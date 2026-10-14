# Memory in context

- Decisions: [0013](../../../decisions/0013-definition-versioning.md),
  [0024](../../../decisions/0024-memory-in-context.md),
  [0026](../../../decisions/0026-where-workers-and-the-conversation-run.md),
  [0031](../../../decisions/0031-memory-capture-context-and-removal.md),
  [0037](../../../decisions/0037-moments.md), [0039](../../../decisions/0039-local-encoder.md)

The conversation runs on the Agent SDK's session, and nixie compacts the session itself. Memory
reaches it 3 ways: a small pinned core in each session's opening, a few items retrieved for each
turn, and 2 recall tools the model calls when it needs more. Retrieval searches memory items and
past messages with a local encoder and keyword lookup, from indexes held in memory. A compaction
summary never becomes memory. The SDK's transcript is a cache, and the event log holds the history.

## The prompt

Each turn's prompt runs from the most stable part to the least, so the prompt cache holds:

1. **The system prompt:** nixie's instructions, the persona fixed for the task's life under
   [0013](../../../decisions/0013-definition-versioning.md) and the
   [skill catalog](../skills.md#the-catalog).
2. **The session:** its opening, which holds the pinned core, the status and the summary of the
   session before it, then every turn since.
   [Session opening and compaction](../core/session-opening.md) sets the opening's slots.
3. **The newest turn:** the task's inbox records, the dashboard data for the conversation, and the
   retrieved items.

[Conversation turns](../../../architecture/core/conversation-turns.md#what-a-query-holds) covers the
settings that switch the SDK's own memory off on every query.

## The pinned core

The pinned core is built for the conversation, and
[memory in context](../../../architecture/memory/context.md#the-pinned-core) covers its rendering,
its budget and the change note. The [pinned core spike](../spikes/sdk-pinned-core/README.md) found
that a resumed session keeps its first system prompt unless the SDK's snapshot is off. The pinned
core therefore lives in each session's opening, which
[session opening and compaction](../core/session-opening.md) sets, and the change note carries an
edit to a running session.

## Retrieval

Per-turn retrieval and the recall tools share one retrieval service over active memory items and
readable past messages. A small local encoder with pinned model assets produces semantic vectors,
with no inference API call. SQLite FTS5 with BM25 serves word, name and reference lookup, and an
exact item ID reads the item directly. The encoder and the ranking are configurable, and
[0039](../../../decisions/0039-local-encoder.md) picks the encoder and its vector size.

### The index

At start, nixie builds an FTS5 table in an in-memory SQLite database, with the porter tokenizer, and
a vector index in process memory. Both derive from active memory items and from your messages and
the model's replies whose keys remain readable. The encoder runs on the host as a text encoder, with
no tools or grants. nixie rebuilds both in full at start and on an encoder change, and search falls
back to keywords while a rebuild runs. Each result records its search mode and any fallback.

A write commits an invalidation record with the item. The retrieval service then drops the old entry
and queues the current version for encoding, outside the write transaction. When an encoding
finishes, the service checks the version, state and key again and discards stale work.

The indexes rank candidate IDs and never supply the returned text. Before returning a candidate, the
service reads its current version, checks that it is active and decrypts it. That final check and
the delivery to the task share one lock with writes, retire and forget, and the delivery records
each item and version before the lock releases. **Why:** a forget that ran between the check and the
delivery would otherwise let the text reach the task after the forget completes. Retire and forget
remove the item's entries, cached results and pending deliveries, and a forget completes only after
that removal.

Neither index is written to disk, exported or backed up, and restart rebuilds them from readable
records. **Why:** the [shredding spike](../spikes/memory-shred/README.md) found that a persisted
FTS5 index keeps forgotten words. The [retrieval spike](../spikes/memory-retrieval/README.md) built
the FTS5 index over 20,000 messages in 62 ms. The [encoder spike](../spikes/encoder/README.md) puts
a semantic rebuild over 20,000 short texts at about 13 s on 2 cores, and keyword search covers the
gap while it runs.

Tool results, worker transcripts and compaction summaries stay out of the index. **Why:** they are
outside content or model text written from it, and retrieving them would place that text beside your
own words.

### Per-turn retrieval

Per-turn retrieval of memory items is built for the conversation, with keyword search only, as
[memory in context](../../../architecture/memory/context.md#per-turn-retrieval) covers. The design
adds 3 things to it. On a task's first turn, the search uses the task's brief. Up to 3 past messages
above the score floor join the items, with past messages already in the session left out. Per-turn
retrieval never places a moment's title, note or reflection, as
[moments](moments.md#reading-moments-back) sets out.

### The recall tools

- **`memory.recall`** returns memory items, as
  [the store](../../../architecture/memory/store.md#recall) covers.
- **`log.search`** returns your past messages and the replies word for word, each with its thread,
  record sequence and date. It declares `read`.

Both accept a natural-language query and keep keyword lookup. A match is never evidence that a
memory is current; the state and version checks decide that.

## Compaction

nixie compacts the conversation's session itself, and stores each summary in the event log under a
key of its own. [Session opening and compaction](../core/session-opening.md) covers the compactor,
the summary record and the forget that erases every summary. A summary never becomes memory, and
retrieval never searches summaries, because the model wrote the summary from an untrusted
conversation and retrieving it would launder that text.

## The SDK transcript

The SDK writes each session's transcript as JSON lines under `CLAUDE_CONFIG_DIR`, inside the imp
that runs the session. The transcript is a cache:

- **Never backed up or exported.** The event log holds the readable history: messages, replies, tool
  activity and summaries.
- **Kept while its task lives.** nixie sets `cleanupPeriodDays` high enough that the SDK never
  deletes a session a task still resumes, and deletes a task's sessions when the task closes.
- **Rebuilt when lost or invalid.**

nixie does not use the SDK's `sessionStore` mirror. **Why:** the option is alpha, it drops writes on
failure, and it would need a write route from every imp to the host.

### Rebuilding a session

The conversation's rebuild is built, as
[conversation turns](../../../architecture/core/conversation-turns.md#rebuilding-a-session) covers:
its first turn carries the recent turns word for word and the unread inbox. The design adds to that
first turn:

- the task's brief, for a task that has one;
- the latest readable compaction summary from before the recent turns, if one exists;
- the canonical state of pending proposals, approvals and action outcomes.

Proposals, approvals and outcomes come from canonical task state, never from summary text, and a
rebuild never infers that an unknown action succeeded. The live view marks the rebuild in the
thread.

### Forgetting and the live session

A forgotten item can sit in a live session's context, and
[memory in context](../../../architecture/memory/context.md#forgetting-and-the-live-session) covers
how a forget cleans up the conversation's session. The design extends the same cleanup to every task
that runs a session, and to a forgotten record as well as a forgotten item. The forget confirmation
shows that a request already sent to the model provider keeps the text it received.

### Removing invalid transcript copies

Each task keeps its SDK state in a directory reserved for it, with no other files, and a forget
removes it in the order the conversation's cleanup follows. The forget stays pending until every
task's cleanup completes, and startup resumes pending cleanups before any affected task runs.
Actions keep their canonical outcomes and never repeat because a query stopped.
