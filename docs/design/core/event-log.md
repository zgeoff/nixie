# The event log and records

- Decisions: [0001](../../decisions/0001-durable-layer.md),
  [0010](../../decisions/0010-memory-store.md),
  [0013](../../decisions/0013-definition-versioning.md),
  [0015](../../decisions/0015-taint-scope.md),
  [0018](../../decisions/0018-the-conversation-and-tasks.md),
  [0025](../../decisions/0025-database-and-topology.md),
  [0027](../../decisions/0027-tasks-and-actions.md)

The event log is nixie's one log of record. Every message you send, model turn, tool call, policy
decision, proposal, approval and action outcome becomes a record, and no record changes in place.
Task state, the dashboard and the live view read projections: tables that nixie updates in the same
transaction as the record that changes them, and rebuilds from the log. The log lives in one SQLite
database under [0025](../../decisions/0025-database-and-topology.md).

## What a record holds

Every record carries one envelope, and its payload depends on its kind.

| Field             | Holds                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| Sequence          | A number that orders the record in the log                                  |
| Time              | When nixie wrote the record                                                 |
| Kind              | Such as `owner_message`, `turn_finished`, `tool_called` or `approval_given` |
| Thread            | The conversation or the task the record belongs to                          |
| Step key          | The task step that wrote it, so a step commits once                         |
| Parent            | The record that caused it, such as the tool call behind a worker's records  |
| Source of content | Your words, your own data, or untrusted content                             |
| Decision          | Rule ID, outcome, deciding stage, and auto-mode's reason and inputs         |
| Prompt cause      | One of the 6 prompt causes, on every record that prompts you                |
| Definitions       | The snapshot hash in force, and the persona and job versions the task pins  |
| Approval          | Proposal ID, approval ID and action hash                                    |
| Payload           | The kind's own data, with erasable fields encrypted                         |

The source of content sits on every tool result. The first build stores it without acting on it, so
taint per job run is a later policy change under [0015](../../decisions/0015-taint-scope.md).

The parent field keeps the delegation chain. A worker's records point at the tool call that started
it, and a task's records point at the routing record that created the task, so the record shows that
no task or worker held wider permissions than the thread that started it.

## Append-only

nixie only appends to the log. A correction is a new record that points at the record it corrects,
such as your answer to an unknown outcome pointing at the action's record. No code path updates or
deletes a record.

Crypto-shredding is the one way content leaves a record. Erasable fields are encrypted, and
forgetting deletes their key. The envelope stays, and a replay shows a gap where the payload was.

## Erasable fields and keys

Records use 2 kinds of key, on the pattern of the per-item memory keys from
[0010](../../decisions/0010-memory-store.md):

- **A key per record** encrypts every free-text field in its payload: your message text, the model's
  text, tool arguments, tool results and worker transcripts. Forgetting one message deletes one key.
- **A key per contact** encrypts a person's details in a contacts table. A record refers to the
  contact by ID and never copies the details, so forgetting a person deletes one key and clears them
  from every structured field.

A free-text field can still mention a contact by name. Forgetting the contact clears the structured
fields, and the client offers to forget each record whose text matches the contact's details.

Records of memory recall, injected memory blocks and memory notices store item and version
references, never a second copy of the text. The logger applies this rule before it persists any
payload, so a generic capture of SDK messages cannot bypass it. Forgetting a memory item therefore
leaves a gap in every record that read it.

The envelope stays in plain text: IDs, kinds, times, rule IDs, outcomes, hashes, the source of
content and declared effects. **Why:** the envelope holds no personal content, and the projections
and replay need it without a decryption per row.

The keys live in a key store apart from the database, each one wrapped by a deployment key. **Why:**
a key kept in the database would come back with any restore of a backup taken before its deletion,
so database backups hold only ciphertext. Forget completes only once every recoverable key copy is
gone, under [memory](../memory/store.md) and
[backup and restore](../deployment/backup-and-restore.md). A restore takes the database backup, the
current key store backup and the deployment key.

The database's full-text index covers only the envelope. A persisted index would keep the words of
an erasable field after its key is gone, so search over free text runs on an index held in memory,
as [memory history and export](#memory-history-and-export) describes.

## Projections

A projection is a table that answers a question the log answers too slowly, such as "which tasks
wait on a proposal". nixie writes each record and every projection row it changes in one
transaction, so a projection never disagrees with the log at a commit. The core projections:

- **Task state:** one row per task, with its state, its lease, its open waits and its pinned
  definition versions, covered in [tasks](./tasks.md).
- **Proposals and approvals:** each proposal's action hash, status, lapse time, optional
  `deadlineAt`, deferred-until time and defer generation.
- **Actions:** each queued action and its outcome, covered in [actions](./actions.md).
- **The task board:** one row per task with its status, last update and what it waits on, under
  [0018](../../decisions/0018-the-conversation-and-tasks.md).

Every projection can be dropped and rebuilt by folding the log from the first record. A rebuild test
in CI folds a recorded log and compares the result with the live tables.

## The dashboard and the live view

The dashboard, the live view and the conversation read the same projections, so you and the
conversation see the same state. The conversation receives the task board as a compact list in its
newest turn. The live view opens a task and reads its records as a conversation, with each tool
call, decision and worker transcript expandable.

The client follows the log by sequence. It loads a projection and the sequence it read from one read
snapshot, then receives every newer record together with the projection rows its transaction
changed, and applies both before it advances its cursor. Catch-up after a disconnect delivers the
rows as of each record, never current rows under an older sequence. A record the client cannot
render yet shows by its kind, so a missing renderer hides nothing.

SQLite allows one writer at a time, so an integer primary key grows in commit order, and a reader
that asks for records after sequence N misses nothing. Every append runs in a `BEGIN IMMEDIATE`
transaction with `synchronous = FULL`. The client stream and the task runners wake by watching the
database's WAL file, with polling as the fallback.

## Memory history and export

Memory lives in its own tables with a history table, not in the log. Every memory write appends a
record that names the memory item and its new version, and the record, the history row and any
approval commit in one transaction. The log holds why a memory changed, and the history table holds
what it changed to.

Retrieval over past conversation searches the log under
[0024](../../decisions/0024-memory-in-context.md), and [memory context](../memory/context.md) owns
the retrieval design. nixie builds the free-text search index in memory at start, from the payloads
it can still decrypt, and updates it on each append. Forgetting a record removes its entries.
**Why:** the index never reaches a backup.

The event log exports as a SQLite file holding the records with decrypted payloads. **Why:** any
SQLite reader opens it with its schema. A shredded payload stays a gap in the export, and creating
an export carries its own declared effect.

## Retention

Retention expires content by shredding keys, so the log stays append-only. Each default is a setting
per kind of record:

| Kind                                | Default                           | Why                                                        |
| ----------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| Envelopes                           | Kept for the deployment's life    | They hold no personal content and explain every action     |
| Your messages and the model's text  | Kept for the deployment's life    | Retrieval over past conversation reads them                |
| Tool results and worker transcripts | Payload expires after 1 year      | They are the bulk of the log, and a year covers any review |
| Definition snapshots                | Kept while a record points at one | A replay always finds its definitions                      |

An expired payload reads as expired in the live view and in an export, next to its envelope. The SDK
transcript is a live cache, not part of the log, under [memory context](../memory/context.md).
