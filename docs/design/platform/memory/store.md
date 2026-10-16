# The memory store

- Decisions: [0010](../../../decisions/0010-memory-store.md),
  [0011](../../../decisions/0011-memory-writes.md),
  [0013](../../../decisions/0013-definition-versioning.md),
  [0024](../../../decisions/0024-memory-in-context.md),
  [0031](../../../decisions/0031-memory-capture-context-and-removal.md),
  [0037](../../../decisions/0037-moments.md)

The [memory store](../../../architecture/memory/store.md) architecture doc covers what is built:
items and versions, a key per item, the operations on one item, recall with its index and delivery
lock, and the forget of one item. This design covers the parts of the store that remain: bulk
deletion of retired memories, forget completion with key backups, the client's actions, the memory
view and export. [Memory writes](writes.md) covers which writes apply at once, and
[memory in context](context.md) covers how memory reaches the model.

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

## Destroying memory beyond one item

The forget of one item, bound to the version its confirmation showed, is built. "Forget that" in the
conversation retires the item instead, with undo and a link to the checked delete. A forget's
confirmation shows the item with its history, lists what is lost, and states that the user's
messages and replies that state the same fact stay under their own record keys, with a link to the
record-forget action. A forget also deletes the compaction summaries that
[memory in context](context.md#compaction) deletes with it.

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
ones. Each item gets its own forgotten record, and the bulk operation reports completion only when
every item's forget completes.

### Forget completion and key backups

A forget stays pending until its key-store checkpoint, its index removal and the
[session cleanup](context.md#removing-invalid-transcript-copies) finish, and with a key backup
registered, until the old key copies are gone from every registered key backup too. The client shows
a pending forget as pending.

A forget forces a key-backup refresh and cleanup at once; the backup schedule sets recovery age, not
forget completion. Cleanup keeps one fresh copy without the deleted keys, removes every older
recoverable copy, and verifies that every remaining copy excludes the deleted keys. It records the
backend's receipts and checks coverage again before the forget completes; a command that exits
cleanly does not prove the keys are gone. Staging files, restore samples and backup caches count as
recoverable copies. A key backend must allow removal of every historical copy it holds, so a backend
with unmanaged versioning or immutable retention cannot hold keys.
[Backup and restore](../deployment/backup-and-restore.md) covers the backup tools, and the
[forget backups spike](../../../../research/forget-backups/) tests one local backend.

## Operations

The store's interface holds recall, remember, retire, restore, undo, pin and forget, and the model's
recall, remember and retire tools. These verbs remain:

| Verb   | Model tool      | Client action | Does                                         |
| ------ | --------------- | ------------- | -------------------------------------------- |
| Export | `memory.export` | Export        | Writes all readable memory to a file         |
| Review |                 | Review        | Approves, edits or rejects a memory proposal |

`memory.export` declares `export`, which the starter rules ask for. Every client action on an item
is a checked action that calls the same interface.

The persona instructs the model to answer questions about memory from recall results, and the
[live view](../channels/live-view.md) renders a recall result as the items themselves. Recall
returns each item's links to moments as moment IDs and titles, never moment text, as
[moments](moments.md#reading-moments-back) sets out.

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
