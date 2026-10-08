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
core in the system prompt, a few items retrieved for each turn and placed in the newest turn, and
the recall tool the model calls when it needs more. Retrieval searches memory items and past
conversation in the event log, with keyword ranking, from an index held in memory. A compaction
summary stays in the session and never becomes memory. The SDK's own transcript is a cache that the
event log supersedes. Everything in this doc beyond the decisions it links is a proposal.

## The prompt

Each turn's prompt runs from the most stable part to the least, so the prompt cache holds:

1. **The system prompt:** nixie's instructions, the persona fixed for the task's life under
   [0013](../../decisions/0013-definition-versioning.md), and the pinned core.
2. **The session:** every earlier turn, or the compaction summary and the turns kept after it.
3. **The newest turn:** the task's inbox records, the task board for the conversation, and the
   retrieved items.

nixie runs the SDK with `settingSources: []` and with the SDK's own memory switched off:
`autoMemoryEnabled: false` and `autoDreamEnabled: false`. **Why:** the SDK version 0.3.293 that the
spikes use ships an auto-memory directory, a recall supervisor that puts its files into turns, and a
background consolidation, which together would make a second memory store with no provenance and no
review. A test asserts that every `query()` nixie starts sets both flags.

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

Retrieval finds memory items and past messages for a turn, through one index that both per-turn
retrieval and the recall tools search. It ranks with BM25 over SQLite's FTS5, which is keyword
search in the sense of 0024: it matches words, and embeddings stay out until a measurement on the
owner's own memory shows a gain.

### The index

nixie builds the index at start in an FTS5 table in an in-memory SQLite database, with the porter
tokenizer, from every active memory item and every owner message and model reply it can decrypt. It
updates the index in the transaction that writes each item version or record, and removes an entry
when its item retires or its key is deleted. **Why:** a persisted FTS5 index keeps a forgotten word
in its file, and every backup taken before the forget keeps it in plain text, as the
[shredding spike](../../../spikes/memory-shred/README.md) showed, while an index in memory never
reaches a backup.

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

Both take keywords that the model writes, and their descriptions ask for several alternative terms
for each idea, including names, synonyms and the owner's own words.

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
Keywords from the model closed most of that gap for keyword search, at 0.76 against 0.77 for vectors
on the raw message, though the spike's keywords were written with the items in view. BM25 found no
more than plain keyword overlap and ranked the right item higher.

The spike's data is synthetic and written by one author, so it decides nothing about embeddings
under 0024. It does set the next measurement: the
[retrieval spike on the owner's questions](../open-items.md#spikes-to-run), with keywords from a
model that has not seen the items, decides whether embeddings join the index. If they do, a small
model run on the host, such as the spike's MiniLM at about 1 ms per item on a CPU, keeps memory text
on the owner's host.

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
