# The memory store

- Status: Proposed
- Decisions: [0010](../../decisions/0010-memory-store.md),
  [0011](../../decisions/0011-memory-writes.md),
  [0013](../../decisions/0013-definition-versioning.md),
  [0015](../../decisions/0015-taint-scope.md), [0024](../../decisions/0024-memory-in-context.md),
  [0025](../../decisions/0025-database-and-topology.md),
  [0027](../../decisions/0027-tasks-and-outside-actions.md)

nixie keeps long-term memory as rows in its SQLite database, under
[0010](../../decisions/0010-memory-store.md). A memory item is one stored fact, such as "the owner's
dentist is Dr Okafor at Riverside Dental", and every change to it adds a version to a history table.
nixie sets each version's provenance from the turn that wrote it, and the model's arguments never
reach those columns. Each item's text is encrypted with a key of its own, so forgetting deletes one
key and every version of that item becomes unreadable. The model reads memory through a recall tool
that returns stored items word for word, and the owner reads and manages it in the client. This doc
covers the store and its operations; [memory writes](./writes.md) covers which writes apply at once,
and [memory in context](./context.md) covers how memory reaches the model. Everything in this doc
beyond the decisions it links is a proposal, and the owner's open choices for the whole memory
design close it.

## Items and versions

Memory lives in 2 tables beside the [event log](../core/event-log.md), not in it:

- **`memory_items`** holds one row per item: its ID, its current version, its state, whether it is
  pinned, and its creation time. The row is the projection the client and retrieval read.
- **`memory_versions`** is the history table from 0010. It holds one row per version of each item,
  with the text and its provenance, and nixie only appends to it.

Each version holds:

| Field          | Holds                                                                         | Encrypted |
| -------------- | ----------------------------------------------------------------------------- | --------- |
| Item, version  | The item ID and a version number that starts at 1                             | No        |
| Change         | Created, edited, retired, restored, merged or undone                          | No        |
| Text           | The memory as written                                                         | Yes       |
| Evidence quote | The owner's words that back the text, when a quote exists                     | Yes       |
| Evidence       | The owner message record and the quote's offsets in it                        | No        |
| Origin         | Owner, conversation, task, memory writer or consolidation                     | No        |
| Source         | Owner's words, owner's own data, or outside content                           | No        |
| Task           | The task whose step wrote the version, or none for an owner action            | No        |
| Proposal       | The proposal that created the version, or none when it applied at once        | No        |
| Checks         | The verdict of each check from 0011, and the review reason when one failed    | No        |
| Record         | The sequence of the log record that wrote the version, with its snapshot hash | No        |

The source is one of the 3 that the event log records under
[0015](../../decisions/0015-taint-scope.md), and [memory writes](./writes.md#provenance) sets how
nixie picks it. The origin says which part of nixie wrote the version, and the owner is the origin
only for an owner's checked action in the client. **Why:** the client shows how each version came to
exist, and a review of poisoned memory filters on origin and source without decrypting anything.

An item is in one of 3 states:

- **Active:** retrieval and recall return it.
- **Retired:** it stays readable with its history, and retrieval skips it. Recall returns it only
  when asked for retired items. Restoring it adds a version.
- **Forgotten:** its key is deleted, so every version reads as a gap. Nothing restores it.

Retiring is how memory ends a fact that stopped being true, such as an old address. Forgetting is
how the owner destroys one. The model can retire an item through [memory writes](./writes.md), and
only the owner can forget one, as [forgetting](#forgetting) covers.

nixie appends a record to the log for every change, and the record, the version row, the item row
and any approval commit in one transaction, as the
[event log design](../core/event-log.md#memory-history-and-export) sets. A version row and its
record point at each other, so the log holds why an item changed and the history table holds what it
changed to.

The `memory_items` row is a projection of `memory_versions`, and the rebuild check from
[0027](../../decisions/0027-tasks-and-outside-actions.md) folds the versions and compares.

## Keys and forgetting

Each item has its own key, an AES-256-GCM key in the key store that the
[event log design](../core/event-log.md#erasable-fields-and-keys) sets up for record keys. The key
store is a separate SQLite file, each key in it is wrapped by the deployment key, and database
backups therefore hold only ciphertext. Every version of an item is encrypted under the item's key,
with the item ID and version number as additional authenticated data. **Why:** one key per item
makes a forget reach every version at once, and the additional data stops a row from being copied
under another item or version and still decrypting.

The [shredding spike](../../../spikes/memory-shred/README.md) built this layout in `bun:sqlite` and
measured it:

- A forgotten item was unreadable in the live database and in a database backup taken before the
  forget. A key store backup taken before the forget still opened it, until the next backup run
  replaced that copy. The window is the key store's backup interval, daily by default.
- With SQLite's defaults, the deleted wrapped key stayed in the key store file's free space after a
  checkpoint. With `PRAGMA secure_delete = ON`, the bytes left the file at the next checkpoint. The
  key store therefore runs with `secure_delete` on, and a forget completes after a WAL checkpoint of
  the key store.
- 10,000 items with 3 versions each decrypted in 177 to 311 ms with the decryptions run in parallel,
  and unwrapping a key cost about 2 µs. Holding every active item decrypted in memory at start costs
  well under a second at personal scale.

### Forgetting

Forgetting is a checked action in the client, and only the owner takes it. The client shows the item
with its history and asks for a confirmation that lists what is lost. nixie then deletes the key,
checkpoints the key store, marks the item forgotten and appends a `memory_forgotten` record, which
holds the item ID and no text. The versions stay as rows with ciphertext nobody can read, so a
replay shows a gap where the item was.

When the owner says "forget that" in the conversation, the model retires the item through the memory
tool, and the notice of the retirement offers "forget for good" as a checked action. Whether chat
alone can destroy an item is a [decision for the owner](#decisions-for-the-owner).

A forgotten item may sit in a live SDK session that read it, through recall or retrieval. Forgetting
an item that a session read makes that session rebuild before its next turn, which
[memory in context](./context.md#forgetting-and-the-live-session) covers. The live-session boundary
applies to requests that already received the text; the context design states that limit.

Item forget destroys the item's versions and their derived index entries. It does not destroy
independently keyed owner messages or replies that state the same fact. The confirmation states this
scope and links to the separate record-forget action; it never promises that the fact disappears
from all conversation history. Log search may return that fact from a record whose key remains
readable.

A forgotten item cannot be exported or restored, and an undo never reaches across a forget.

## Operations

Memory sits behind one interface with a few verbs, so a later backend can replace the rows without
changing its callers. Each verb is a nixie tool, an owner action in the client, or both:

| Verb        | Model tool               | Owner action | Does                                                               |
| ----------- | ------------------------ | ------------ | ------------------------------------------------------------------ |
| Recall      | `memory.recall`          | Search       | Returns stored items word for word, with versions and provenance   |
| Remember    | `memory.remember`        | Add, edit    | Creates an item or adds a version to one                           |
| Retire      | `memory.retire`          | Retire       | Adds a version that retires an item                                |
| Restore     |                          | Restore      | Adds a version that makes a retired item active again              |
| Undo        |                          | Undo         | Adds a version whose text is an earlier version's text             |
| Pin         | `memory.remember` option | Pin, unpin   | Puts an item in the pinned core, or takes it out                   |
| Forget      |                          | Forget       | Deletes the item's key                                             |
| History     | `memory.recall` option   | History      | Returns every readable version of an item                          |
| Export      | `memory.export`          | Export       | Writes all readable memory to a file the owner chooses             |
| Propose     |                          | Review       | Approves, edits or rejects a memory proposal from the digest sheet |
| Consolidate | `memory.consolidate`     |              | Proposes merges, rewrites and retirements, as one reviewed diff    |

`memory.remember`, `memory.retire` and `memory.consolidate` declare the `note` effect, which the
[policy decision point](../policy/decision-point.md#effects) defines for writes inside nixie, so the
starter rules allow the call and the checks in [memory writes](./writes.md) decide whether it
applies at once. `memory.recall` declares `read`, and `memory.export` declares `export`.

A model tool takes only content: the text, the evidence quote, and the item and version it revises.
nixie fills every provenance field from the step that called it. A revision carries the version it
read, and the write fails as stale when the item has moved on, as Hermes binds a staged edit to the
entry it targets ([memory notes](../../research/2.4-notes/memory-models.md#markdown-in-git)).
**Why:** 2 tasks that edit the same item from the same version must not silently overwrite each
other.

Undo and restore never rewrite history: each adds a version. An owner action in the client applies
at once, with the owner as origin and the owner's words as source, because a checked action in the
client cannot come from injected content.

### Recall

`memory.recall` takes a query, a list of item IDs, or neither, which lists every active item a page
at a time. It returns each item's text exactly as stored, its ID and version, its origin and source,
and when it was written, and never a summary. The persona's instructions tell the model to answer a
question about memory from these items, and the client renders a recall result in the live view as
the items themselves, each with a tap through to its history, as the
[live view](../channels/live-view.md#a-task-as-a-conversation) sets out. **Why:** "nothing is
hidden" asks for the raw data, and the owner can check the model's answer against the items on
screen.

A record that recalls memory lists each item and version it returned, as the
[event log design](../core/event-log.md#memory-history-and-export) requires, so a replay shows what
the model saw.

Recall searches the same in-memory index that per-turn retrieval uses, which
[memory in context](./context.md#retrieval) covers.

## Definition versioning

Every memory record carries the snapshot hash of the definitions in force, like every record under
[0013](../../decisions/0013-definition-versioning.md), and the version row keeps the record's
sequence, so each version leads to its snapshot. Memory itself versions through the history table,
not through the snapshot, as 0013 states. The checker model's prompt is part of the policy snapshot,
because it decides which writes skip review. **Why:** a replay of a write that applied at once needs
the checker's prompt as it was, and a changed prompt must reach running tasks at once, as rules do.

## The memory view

The client gains a memory view, which the [client design](../channels/client.md) leaves to this
design. It shows:

- every active item with its text, origin, source and age, with search over the same index as recall
- the pinned core, with its size against its budget
- each item's history as a list of versions, each with its provenance, its evidence quote shown
  inside the owner message it came from, and a diff against the version before
- retired items, apart from active ones, and each forgotten item as a dated gap
- the actions from [operations](#operations): add, edit, pin, retire, restore, undo, forget and
  export

Every action is a checked action with its own record, through the channel adapter's action entry
point. Memory proposals appear on the digest sheet with the routine items, as the
[approvals design](../policy/approvals.md#the-digest-sheet) sets, and the memory view links to them.

## Export

Export writes every readable item to one JSON file, under 0010: each item with its state and every
version, with text, evidence quote and provenance, plus a header with the export time, the schema
version and the snapshot hash in force. A forgotten item appears as its ID and the time it was
forgotten, with no text. The schema is documented beside the code and versioned with it. **Why:**
JSON is the plain format 0010 gives as its example, any tool reads it, and one file keeps the
history with the items it belongs to.

Export is the `memory.export` tool and a button in the client. The tool declares the `export`
effect, which the starter rule set asks for, so the model never exports on its own; the button is a
checked action and needs no further approval. The file goes to a place the owner picks, and nixie
never sends it to an outside destination. The event log export from the
[event log design](../core/event-log.md#memory-history-and-export) uses the same effect.

## Agreed capture

The conversation and tasks write during a turn, and a background writer captures passing facts in
bounded batches. SDK compaction remains responsible for session continuity. Both paths use the same
quote, token and assertion checks, as [memory writes](./writes.md#who-writes) sets out. Batching
reduces extraction calls at the cost of delayed capture; provider costs and real-history quality
remain unmeasured.

## Decisions for the owner

These choices are the memory design's open decisions, each with a recommendation. The memory docs
assume the recommendation until the owner decides.

1. **The SDK transcript.** The Agent SDK keeps its own transcript of each session under
   `CLAUDE_CONFIG_DIR`, inside the imp that runs the session.
   - Options: a cache that the event log supersedes, rebuilt from the log when it is lost or must
     drop forgotten content; or a store of record that the owner can read, back up and export.
   - Recommendation: a cache, as [memory in context](./context.md#the-sdk-transcript) sets out. The
     log holds every owner message, reply, tool call and compaction summary, so the owner loses
     nothing the transcript holds, and backups and export cover one store.
   - Trade-off: a lost or rebuilt transcript costs the conversation the context older than the
     rebuild window, and one turn at full input price.
2. **"Forget" in chat.** Forgetting destroys an item in every backup and cannot be undone.
   - Options: chat retires the item, with "forget for good" one tap away on the notice; or a
     quote-backed "forget that" in chat forgets at once.
   - Recommendation: chat retires, and only a checked action forgets. A misread "forget that", or
     one injected into a pasted message that the checker misjudges, then costs an undo, never data.
   - Trade-off: the owner taps once more to destroy an item, and a retired item stays readable in
     the store and its backups until the owner does.
3. **Notices for writes that apply at once.** 0011 requires that the owner sees each such write and
   can undo it.
   - Options: a compact line under nixie's reply, such as "Remembered: dentist is Dr Okafor", with
     undo; a count in the digest sheet, such as "nixie stored 3 memories", with no line in the
     conversation; or both.
   - Recommendation: a line under the reply. The owner sees the write while the context is fresh,
     and undo is one tap.
   - Trade-off: the conversation carries a line for each memory, which a busy conversation may find
     noisy; the count alone is quieter and slower to catch a misreading.
