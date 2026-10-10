# The memory store

- Decisions: [0010](../../../decisions/0010-memory-store.md),
  [0011](../../../decisions/0011-memory-writes.md),
  [0013](../../../decisions/0013-definition-versioning.md),
  [0024](../../../decisions/0024-memory-in-context.md),
  [0031](../../../decisions/0031-memory-capture-context-and-removal.md),
  [0037](../../../decisions/0037-moments.md)

nixie keeps long-term memory as rows in its SQLite database. A memory item is one stored fact, such
as "my dentist is Dr Okafor at Riverside Dental", and every change to it adds a version to a history
table. nixie sets each version's provenance from the turn that wrote it, and the model's arguments
never reach those columns. Each item's text is encrypted under a key of its own, so forget deletes
one key and every version of that item becomes unreadable. The model reads memory through a recall
tool that returns stored items word for word, and the client shows and manages the same items.
[Memory writes](writes.md) covers which writes apply at once, and [memory in context](context.md)
covers how memory reaches the model.

## The first build

The first build implements every memory decision with the smallest mechanism that keeps its
guarantee true:

- **Store and operations:** items, the history table, a key per item, recall, the memory view,
  retire with undo, forget, bulk deletion of retired memories and JSON export.
- **Writes:** conversation writes and the batched writer, both behind the quote, token and checker
  checks, with grouped notices.
- **Retrieval:** FTS5 and one pinned local encoder, held in memory and rebuilt in full at start and
  on an encoder change. Search falls back to keywords while a rebuild runs.
- **Forget in live sessions:** any forget rebuilds every live session before its next step and
  deletes the key of every stored compaction summary, so no summary holds the forgotten text.
- **Forget and backups:** key-backup publication and forget share one exclusive lock, so no backup
  publishes a key copy staged before a forget.

A rebuild on every forget costs session rebuilds and every summary, which is acceptable while
forgets are rare. Each extension below keeps the same contract and makes it cheaper:

- **Session exposure records** and summary dependency sets, so a forget rebuilds only the sessions
  and summaries that read the item.
- **Index generations,** so a rebuilt index swaps in while queries continue.
- **Generation watermarks** on staged key copies, so key-backup publication and forget run without
  the shared lock.
- **Consolidation,** which [memory writes](writes.md#consolidation) describes.

## Items and versions

Memory lives in 2 tables beside the [event log](../core/event-log.md):

- **`memory_items`** holds one row per item: its ID, current version, state, pin flag and creation
  time. The row is a projection of the versions, and the rebuild check from
  [0027](../../../decisions/0027-tasks-and-actions.md) compares it against them.
- **`memory_versions`** holds one row per version, and nixie only appends to it.

| Field           | Holds                                                                    | Encrypted |
| --------------- | ------------------------------------------------------------------------ | --------- |
| Item, version   | The item ID and a version number that starts at 1                        | No        |
| Change          | Created, edited, retired, restored or undone                             | No        |
| Text            | The memory as written                                                    | Yes       |
| Evidence quote  | Your words that back the text, when a quote exists                       | Yes       |
| Evidence        | Your message record and the quote's offsets in it                        | No        |
| Intent quote    | Your request for a retirement, when present                              | Yes       |
| Intent evidence | The request record and its quote offsets                                 | No        |
| Origin          | You, the conversation, a task or the memory writer                       | No        |
| Source          | Your words, your own data, or outside content                            | No        |
| Task            | The task whose step wrote the version, or none for your own action       | No        |
| Proposal        | The proposal that created the version, or none when it applied at once   | No        |
| Checks          | The verdict of each check from 0011, and the review reason on a failure  | No        |
| Record          | The sequence of the log record that wrote the version, with its snapshot | No        |

Origin and source stay in plaintext. **Why:** the client shows how each version came to exist, and a
review of poisoned memory filters on them without decrypting anything. The source is one of the 3
that [0015](../../../decisions/0015-taint-scope.md) defines, and
[memory writes](writes.md#provenance) sets how nixie picks it.

An item is in one of 3 states:

- **Active:** retrieval and recall return it.
- **Retired:** retrieval skips it, and recall returns it only when asked for retired items. It stays
  readable with its history, and restoring it adds a version.
- **Forgotten:** its key is deleted, so every version reads as a gap. Nothing restores it.

Retirement ends a fact that stopped being true, such as an old address. Forget destroys an item, and
only a checked action in the client forgets one.

The version row, its log record, the item row and any approval commit in one transaction, as the
[event log design](../core/event-log.md) sets. The record holds why an item changed, and the version
holds what it changed to.

## Keys and forgetting

Each item has its own AES-256-GCM key in the key store that the
[event log design](../core/event-log.md) sets up. The key store is a separate SQLite file, each key
in it is wrapped by the deployment key, and database backups hold only ciphertext. Every version is
encrypted under its item's key, with the item ID and version number as additional authenticated
data. **Why:** one key per item makes a forget reach every version at once, and the additional data
stops a row copied under another item or version from decrypting.

The key store runs with `PRAGMA secure_delete = ON`, and forget waits for its WAL checkpoint.
**Why:** the [shredding spike](../spikes/memory-shred/README.md) found that a deleted key stays in
the file's free space under SQLite's defaults.

### Forgetting

Forget is a checked action in the client. Its confirmation shows the item with its history, lists
what is lost, and binds to the item's current version, so a later edit makes it stale. nixie then
deletes the key, checkpoints the key store, marks the item forgotten and appends a
`memory_forgotten` record with the item ID and no text. The version rows stay as unreadable
ciphertext, so a replay shows a gap where the item was.

"Forget that" in the conversation retires the item instead, with undo and a link to the checked
delete. [Retirement intent](writes.md#retirement-intent) binds that request to its target.

A forget destroys the item's versions, its index entries and the compaction summaries that
[memory in context](context.md#compaction) deletes with it. It leaves your messages and replies that
state the same fact under their own record keys, and the confirmation shows that scope and links the
record-forget action. A forgotten item never exports or restores, and an undo never reaches across a
forget.

### Bulk deletion of retired memories

The retired-memory view offers one checked action that permanently deletes selected retired items or
all of them. Its preview lists the items and exact versions and states that deletion cannot be
undone and that chat records remain. The confirmation binds to that fixed set. Before it deletes any
key, nixie validates every selected item and version and reserves the whole set, so a stale target
stops the operation before anything is destroyed:

- An item restored or changed after the preview makes the confirmation stale.
- An item retired after the preview never joins it.
- Restore, undo and edit cannot change a reserved item while deletion runs.

The operation records per-item progress, deletes keys idempotently and resumes after a crash. A
partial run never restores a key it deleted, and its status separates deleted items from pending
ones. Each item gets its own `memory_forgotten` record, and the bulk operation reports completion
only when every item's forget completes.

### Forget completion and key backups

A forget is a durable operation that stays pending until all of these finish:

1. the key-store checkpoint;
2. removal of the item's index entries and cached results;
3. the [session cleanup](context.md#removing-invalid-transcript-copies) for every live session;
4. removal of the old key copies from every registered key backup.

The client shows a pending forget as pending, and recovery retries it. A deleted key never returns
while the forget waits. With no key backup registered, a forget completes after local cleanup.

A forget forces a key-backup refresh and cleanup at once; the backup schedule sets recovery age, not
forget completion. Cleanup keeps one fresh copy without the deleted keys, removes every older
recoverable copy, and verifies that every remaining copy excludes the deleted keys. It records the
backend's receipts and checks coverage again before the forget completes; a command that exits
cleanly does not prove the keys are gone. Staging files, restore samples and backup caches count as
recoverable copies. A key backend must allow removal of every historical copy it holds, so a backend
with unmanaged versioning or immutable retention cannot hold keys.
[Backup and restore](../deployment/backup-and-restore.md) covers the backup tools, and the
[forget backups spike](../spikes/forget-backups/) tests one local backend.

## Operations

Memory sits behind one interface, so a later backend can replace the rows without changing its
callers. Each verb is a nixie tool, a checked action in the client, or both:

| Verb        | Model tool               | Client action | Does                                                  |
| ----------- | ------------------------ | ------------- | ----------------------------------------------------- |
| Recall      | `memory.recall`          | Search        | Returns stored items word for word, with provenance   |
| Remember    | `memory.remember`        | Add, edit     | Creates an item or adds a version                     |
| Retire      | `memory.retire`          | Retire        | Adds a version that retires an item                   |
| Restore     |                          | Restore       | Adds a version that makes a retired item active       |
| Undo        |                          | Undo          | Adds a version with an earlier version's text         |
| Pin         | `memory.remember` option | Pin, unpin    | Puts an item in the pinned core or takes it out       |
| Forget      |                          | Forget        | Deletes the item's key                                |
| Export      | `memory.export`          | Export        | Writes all readable memory to a file                  |
| Review      |                          | Review        | Approves, edits or rejects a memory proposal          |
| Consolidate | `memory.consolidate`     |               | Proposes merges, rewrites and retirements as one diff |

`memory.remember`, `memory.retire` and `memory.consolidate` declare the `note` effect, which the
starter rules allow, and the gate in [memory writes](writes.md) decides whether a call applies at
once. `memory.recall` declares `read`, and `memory.export` declares `export`, which the starter
rules ask for.

A revision carries the version it read, and the write fails as stale when the item has moved on.
**Why:** 2 tasks that edit the same item must never silently overwrite each other. Undo and restore
add versions and never rewrite history.

### Recall

`memory.recall` takes a query, a list of item IDs, or neither, which lists every active item a page
at a time. It returns each item's text exactly as stored, with its ID, version, origin, source and
date, and never a summary. With its history option it returns every readable version of an item. The
persona instructs the model to answer questions about memory from these items, and the
[live view](../channels/live-view.md) renders a recall result as the items themselves. **Why:** a
request for everything returns the raw data, so you can check the answer against the items on
screen.

The recall record lists each item and version it returned, so a replay shows what the model saw. The
record holds references, not text, so a forget leaves no readable copy behind. Recall searches the
index that [memory in context](context.md#retrieval) describes.

Recall returns each item's links to moments as moment IDs and titles, never moment text, under
[0037](../../../decisions/0037-moments.md). The model reads a linked moment through `moment.read`
when the reason behind a fact matters.

## Definition versioning

Every memory record carries the snapshot hash of the definitions in force, under
[0013](../../../decisions/0013-definition-versioning.md), and memory itself versions through the
history table. The checker's prompt is part of the policy snapshot. **Why:** a replay of a write
that applied at once needs the checker's prompt as it was, and a changed prompt reaches running
tasks at once, as rules do.

## The memory view

The client's memory view shows:

- every active item with its text, origin, source and age, with search over the recall index
- the pinned core, with its size against its budget
- each item's history, with each version's provenance, its evidence quote inside the message it came
  from, and a diff against the version before
- retired items apart from active ones, and each forgotten item as a dated gap
- the actions from [operations](#operations)

Each action is a checked action with its own record. Memory proposals appear in the approval digest
with the other routine items, and the memory view links to them.

## Export

Export writes every readable item to one JSON file: each item with its state and every version, with
text, evidence quote and provenance, and a header with the export time, the schema version and the
snapshot hash. A forgotten item appears as its ID and the time it was forgotten. The schema is
versioned beside the code. **Why:** any tool reads JSON, and one file keeps the history with its
items.

The export button is a checked action. The `memory.export` tool asks under the starter rules, so the
model never exports on its own. The file goes where you pick, and nixie never sends it to an outside
destination.
