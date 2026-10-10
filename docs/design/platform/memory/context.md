# Memory in context

- Decisions: [0013](../../../decisions/0013-definition-versioning.md),
  [0024](../../../decisions/0024-memory-in-context.md),
  [0026](../../../decisions/0026-where-workers-and-the-conversation-run.md),
  [0031](../../../decisions/0031-memory-capture-context-and-removal.md),
  [0037](../../../decisions/0037-moments.md)

The conversation runs on the Agent SDK's session and compaction. Memory reaches it 3 ways: a small
pinned core in the system prompt, a few items retrieved for each turn, and 2 recall tools the model
calls when it needs more. Retrieval searches memory items and past messages with a local encoder and
keyword lookup, from indexes held in memory. A compaction summary stays in the session and never
becomes memory. The SDK's transcript is a cache, and the event log holds the history.

## The prompt

Each turn's prompt runs from the most stable part to the least, so the prompt cache holds:

1. **The system prompt:** nixie's instructions, the persona fixed for the task's life under
   [0013](../../../decisions/0013-definition-versioning.md), the
   [skill catalog](../skills.md#the-catalog) and the pinned core.
2. **The session:** every earlier turn, or the compaction summary and the turns after it.
3. **The newest turn:** the task's inbox records, the dashboard data for the conversation, and the
   retrieved items.

nixie runs the SDK with `settingSources: []` and passes its own settings through the `settings`
option of `query()`. Those settings switch the SDK's own memory off with `autoMemoryEnabled: false`
and `autoDreamEnabled: false`, and a test asserts that every `query()` passes both. **Why:** the
SDK's auto-memory would make a second memory store with no provenance and no review.

## The pinned core

The pinned core is the set of items you pin, such as your name and pronouns. nixie renders it into
the system prompt as a list of items, each with its ID, in pin order. Its budget is 2,000 tokens by
default and configurable, and pinning past it asks you to unpin something first. **Why:** the core
rides in the cached prefix of every turn of every task, and every change to it costs one cache write
per live session.

nixie sets `snapshot: false` on every session and builds the system prompt on each `query()` from
the task's persona version and the current core. On the turn after the core changes, nixie also puts
a short change note before your message that states the changed items, at about 30 tokens per
change. **Why:** the SDK otherwise keeps a session's first system prompt until it compacts, and a
pinned or edited item must reach the conversation on its next turn. A model can still repeat the old
value from its own earlier turns, which the note stops. An unchanged core renders the same bytes, so
the cache holds. The [pinned core spike](../spikes/sdk-pinned-core/README.md) is the evidence.

## Retrieval

Per-turn retrieval and the recall tools share one retrieval service over active memory items and
readable past messages. A small local encoder with pinned model assets produces semantic vectors,
with no inference API call. SQLite FTS5 with BM25 serves word, name and reference lookup, and an
exact item ID reads the item directly. The encoder and the ranking are configurable, and the encoder
choice is open in [GEO-303](https://linear.app/zgeoff/issue/GEO-303).

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
the FTS5 index over 20,000 messages in 62 ms and measured embedding at 1.2 to 2.6 ms per item. A
full semantic rebuild over that many messages is unmeasured, and keyword search covers the gap while
it runs.

Tool results, worker transcripts and compaction summaries stay out of the index. **Why:** they are
outside content or model text written from it, and retrieving them would place that text beside your
own words.

### Per-turn retrieval

Before each turn, nixie searches with the text of your new messages, or with the task's brief on its
first turn. It places up to 5 memory items and up to 3 past messages above a score floor in the
newest turn, all 3 numbers configurable. Each entry carries its ID, version or record sequence,
source and date, inside a block that labels them as stored items, not instructions. Pinned items and
messages already in the session stay out. The turn's record lists each item and version it placed,
as references, not text. Per-turn retrieval never places a moment's title, note or reflection, as
[moments](moments.md#reading-moments-back) sets out.

### The recall tools

- **`memory.recall`** returns memory items, as [the store](store.md#recall) covers.
- **`log.search`** returns your past messages and the replies word for word, each with its thread,
  record sequence and date. It declares `read`.

Both accept a natural-language query and keep keyword lookup. A match is never evidence that a
memory is current; the state and version checks decide that.

## Compaction

The SDK compacts a session when its context fills, and nixie keeps that behaviour:

| Control                       | Kind         | Setting                                 |
| ----------------------------- | ------------ | --------------------------------------- |
| `autoCompactEnabled`          | Setting      | On                                      |
| `autoCompactWindow`           | Setting      | 200,000 tokens by default, configurable |
| `idleCompaction`              | Setting      | Off                                     |
| `precomputeCompactionEnabled` | Setting      | Off                                     |
| `PostCompact` hook            | Hook         | Records the summary                     |
| `compact_boundary` message    | Stream event | Records tokens before and after         |

Idle and precomputed compaction stay off. **Why:** a step's commit records the session's last entry
as the point that [crash recovery](../core/tasks.md) resumes at, so the session changes only inside
a step that holds the task's lease.

nixie writes each summary as a `session_compacted` record, encrypted under its own record key, and
the live view shows it. The summary never becomes memory, and retrieval never searches summaries.
**Why:** the model wrote the summary from an untrusted conversation, and retrieving it would launder
that text. A forget deletes the key of every stored summary as part of its operation.

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

A rebuild starts a new session from the log. Its first turn carries:

- the task's brief;
- the thread's recent turns word for word, up to 30,000 tokens by default;
- the latest readable compaction summary from before those turns, if one exists;
- the unread inbox, and the canonical state of pending proposals, approvals and action outcomes.

A rebuild restores application continuity, not an identical SDK session. Context older than the
recent turns reaches the new session only through a summary or recall. Proposals, approvals and
outcomes come from canonical task state, never from summary text, and a rebuild never infers that an
unknown action succeeded. The live view marks the rebuild in the thread.

### Forgetting and the live session

A forgotten item or record can sit in a live session's context. Each forget therefore marks every
live session for rebuild, and each task rebuilds before its next step. A request already sent to the
model provider keeps the text it received, and the forget confirmation shows that limit.

### Removing invalid transcript copies

Each task keeps its SDK state in a directory reserved for it, with no other files. Forget cleans up
each invalid session in order:

1. It commits a `session_invalidated` record per task, which blocks every query and resume from that
   session.
2. The runner aborts any active query, marks the step interrupted, and waits for the SDK process to
   exit. A shutdown timeout replaces the imp.
3. nixie deletes the task's state directory, checks that it is gone, and records
   `session_cleanup_completed`.

The task then starts a fresh session from the log. The forget stays pending until every cleanup
completes, and startup resumes pending cleanups before any affected task runs. Actions keep their
canonical outcomes and never repeat because a query stopped.
