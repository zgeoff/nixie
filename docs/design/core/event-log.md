# The event log and records

- Status: Proposed
- Decisions: [0001](../../decisions/0001-durable-layer.md),
  [0010](../../decisions/0010-memory-store.md),
  [0013](../../decisions/0013-definition-versioning.md),
  [0015](../../decisions/0015-taint-scope.md),
  [0018](../../decisions/0018-main-thread-and-tasks.md),
  [0025](../../decisions/0025-database-and-topology.md),
  [0027](../../decisions/0027-tasks-and-outside-actions.md)

The event log is nixie's one log of record. Every owner message, model turn, tool call, policy
decision, proposal, approval and outside action outcome becomes a record in it, and no record is
ever changed in place. Task state, the task board and the live view are projections: tables that
nixie updates in the same transaction as the record that changes them, and that nixie can rebuild
from the log. The log lives in one SQLite database with the rest of nixie's state, under
[0025](../../decisions/0025-database-and-topology.md). Everything in this doc beyond the decisions
it links is a proposal.

## What a record holds

A record is one row of the log. Every record carries the same envelope, and its payload depends on
its kind.

| Field             | Holds                                                                        | Required by                                                                                      |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Sequence          | A number that orders the record in the log                                   | This design                                                                                      |
| Time              | When nixie wrote the record                                                  | This design                                                                                      |
| Kind              | Such as `owner_message`, `turn_finished`, `tool_called` or `approval_given`  | This design                                                                                      |
| Thread            | The conversation or the task the record belongs to                           | [0018](../../decisions/0018-main-thread-and-tasks.md)                                            |
| Step key          | The task step that wrote it, for idempotent steps                            | [0001](../../decisions/0001-durable-layer.md)                                                    |
| Parent            | The record that caused it, such as the tool call behind a worker's records   | [0006](../../decisions/0006-approval-record.md)                                                  |
| Source of content | Owner's words, owner's own data, or outside content                          | [0015](../../decisions/0015-taint-scope.md)                                                      |
| Decision          | Rule ID, outcome, deciding stage, and auto-mode's reason and inputs          | [0004](../../decisions/0004-rule-engine.md), [0008](../../decisions/0008-auto-mode.md)           |
| Prompt cause      | One of the 6 causes, on every record that prompts the owner                  | [0005](../../decisions/0005-effects-and-taint.md), [0028](../../decisions/0028-policy-design.md) |
| Definitions       | The snapshot hash in force, and the persona and job versions the task pinned | [0013](../../decisions/0013-definition-versioning.md)                                            |
| Approval          | Proposal ID, approval ID and action hash                                     | [0006](../../decisions/0006-approval-record.md)                                                  |
| Payload           | The kind's own data, with erasable fields encrypted                          | [0010](../../decisions/0010-memory-store.md)                                                     |

The source of content sits on every tool result. The first build stores it without acting on it, so
taint per job run becomes a policy change later, as [0015](../../decisions/0015-taint-scope.md)
requires.

The parent field keeps the delegation chain. A worker's records point at the tool call that started
it, and a task's records point at the routing record that created the task, so the record shows that
no task or worker held wider permissions than the thread that started it.

A rule created at runtime carries the ID of the approval that created it, and a seeded rule carries
the definitions commit, under [0013](../../decisions/0013-definition-versioning.md). A trigger
source writes a record for each event it delivers, with the source's cursor, so a restart resumes
without missing or repeating an event under [0016](../../decisions/0016-own-interfaces.md).

## Append-only

nixie only appends to the log. A correction is a new record that points at the record it corrects,
such as an owner's resolution of an unknown outcome pointing at the action's record. No code path
updates or deletes a record.

Crypto-shredding is the one way a record's content leaves. Erasable fields are encrypted, and
forgetting deletes their key, as [0010](../../decisions/0010-memory-store.md) does for memory items.
The record stays with its envelope, and a replay shows a gap where the payload was.

## Erasable fields and keys

Memory items have a key per item under [0010](../../decisions/0010-memory-store.md). Records follow
the same pattern with 2 kinds of key:

- **A key per record** encrypts every free-text field in its payload: the owner's message text, the
  model's text, tool arguments, tool results and worker transcripts. Forgetting one message or one
  tool result deletes one key, and nothing else in the log changes.
- **A key per contact** encrypts a person's details, such as a name, an address or a phone number,
  in a contacts table. A record refers to the contact by ID and never copies the details, so
  forgetting a person deletes one key and clears them from every structured field at once.

The envelope stays in plain text: IDs, kinds, times, rule IDs, outcomes, hashes, the source of
content and declared effects. **Why:** the envelope holds no personal content, and the projections,
the task board and replay need it without a decryption per row.

A free-text field can still mention a contact by name. Forgetting the contact clears the structured
fields, and the client offers to forget each record whose text matches the contact's details, which
the owner confirms.

The keys live in a key store apart from the database, each one wrapped by a deployment key, and the
memory item keys from 0010 live there too. **Why:** a database backup taken before a key is deleted
holds the wrapped key next to its ciphertext, so a key kept in the database would come back with any
restore. Database backups therefore hold only ciphertext. The key store's backup keeps one copy,
which each backup run replaces, so a deleted key leaves every backup at the next run, daily by
default. A restore takes the database backup, the current key store backup and the deployment key,
which is a deployment secret kept with the other secrets under
[0020](../../decisions/0020-deployment.md). The
[backup and restore spike](../open-items.md#spikes-to-run) checks that restore.

The database's own full-text index covers only the envelope. Free text is erasable, and a persisted
index would keep its words after the key is gone, so full-text search over message content runs on
an index held in memory, as [memory history and export](#memory-history-and-export) describes.

## Projections

A projection is a table that answers a question the log answers too slowly, such as "which tasks
wait on a proposal". nixie writes each record and every projection row it changes in one
transaction, so a projection never disagrees with the log at a commit boundary. These projections
serve the core:

- **Task state:** one row per task, with its state, its lease, its open waits and its pinned
  definition versions. [Tasks](./tasks.md) covers it.
- **Proposals and approvals:** each proposal's action hash, status, lapse time, optional real
  deadline `deadlineAt`, deferred-until time and defer generation.
- **Outside actions:** each queued action and its outcome, covered in
  [outside actions](./outside-actions.md).
- **The task board:** one row per task with its status, last update and what it waits on, which
  [0018](../../decisions/0018-main-thread-and-tasks.md) requires.

The projections are state tables beside the log, under
[0027](../../decisions/0027-tasks-and-outside-actions.md). Every projection can be dropped and
rebuilt by folding the log from the first record. A rebuild test in CI folds a recorded log and
compares the result with the live tables.

## The live view and the task board

The live view and the conversation's task board read the same projections, so the owner and the
conversation see the same state, as [0018](../../decisions/0018-main-thread-and-tasks.md) requires.
The task board is the short form: the conversation receives it as a compact list in its newest turn.
The live view is the long form: the client opens a task and reads its records as a conversation,
with each tool call, decision and worker transcript expandable.

The client follows the log by sequence. It loads a projection, notes the last sequence it read, and
then receives every newer record together with the projection rows that its transaction changed. The
initial projection and its sequence come from one read snapshot. Catch-up events carry the rows as
of each record, from retained deltas or a fold at that sequence, never current rows under an old
event ID. The client applies records and changed rows together before it advances its cursor. A
record the client cannot render yet still shows by its kind, so nothing is hidden by a missing
renderer.

Following by sequence needs a sequence that orders records by commit. SQLite allows one writer at a
time, so an integer primary key grows in commit order, and a reader that asks for records after
sequence N misses nothing. Every append runs in a `BEGIN IMMEDIATE` transaction with
`synchronous = FULL`, through nixie's own Kysely dialect off the main thread, as 0025 sets. The
client's stream and the task runners wake by watching the database's WAL file, with polling as the
fallback.

On Postgres, which 0025 keeps for a second host, identity values follow the order transactions ask
for them, not the order they commit, so appends take a transaction-level advisory lock to keep the
two orders the same. Readers wake with `LISTEN` there, and every read before a write takes
`FOR UPDATE`.

## Memory history and export

Memory lives in its own tables with a history table under
[0010](../../decisions/0010-memory-store.md), not in the log. Every memory write appends a record
that names the memory item and its new version, and the record, the history row and any approval
commit in one transaction. The log holds why a memory changed, and the history table holds what it
changed to.

Retrieval over past conversation searches the log, under
[0024](../../decisions/0024-memory-in-context.md), with keyword search first. A persisted full-text
index, such as FTS5, keeps the words of an erasable field after its key is deleted, in the live
database and in every backup. nixie therefore builds its search index for free text in memory at
start, from the payloads it can still decrypt, and updates it on each append; forgetting a record
removes its entries. **Why:** the index never reaches a backup, and its size follows the log's free
text, which the [retrieval spike](../open-items.md#spikes-to-run) measures along with whether ranked
search pays off.

A record that recalls memory lists each memory item it read with the item's version. **Why:** the
history table keeps every version, so a replay shows what the model saw at the cost of a few IDs per
record.

Memory export is a tool and a button under [0010](../../decisions/0010-memory-store.md). The event
log exports the same way, as a SQLite file holding the records with decrypted payloads, as a default
the owner can change. **Why:** any SQLite reader opens the file and keeps its schema, and the
Library of Congress lists SQLite as a preferred format for datasets. A shredded payload stays a gap
in the export. Creating an export carries its own declared effect, as memory export does.

## Retention

Retention expires content by shredding keys, so the log stays append-only. The defaults below are
settings the owner can change per kind of record:

| Kind                                   | Default                           | Why                                                        |
| -------------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| Envelopes                              | Kept for the deployment's life    | They hold no personal content and explain every action     |
| Owner messages and the model's replies | Kept for the deployment's life    | Retrieval over past conversation reads them under 0024     |
| Tool results and worker transcripts    | Payload expires after 1 year      | They are the bulk of the log, and a year covers any review |
| Definition snapshots                   | Kept while a record points at one | A replay always finds its definitions                      |

An expired payload reads as expired in the live view and in an export, next to its envelope. The SDK
transcript under `CLAUDE_CONFIG_DIR` is either a store the owner can read and export or a cache that
the log supersedes, which stays a [deferred decision](../open-items.md#deferred-decisions).
