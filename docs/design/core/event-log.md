# The event log and records

- Status: Proposed
- Decisions: [0001](../../decisions/0001-durable-layer.md),
  [0010](../../decisions/0010-memory-store.md),
  [0013](../../decisions/0013-definition-versioning.md),
  [0015](../../decisions/0015-taint-scope.md), [0018](../../decisions/0018-main-thread-and-tasks.md)

The event log is nixie's one log of record. Every owner message, model turn, tool call, policy
decision, proposal, approval and outside action outcome becomes a record in it, and no record is
ever changed in place. Task state, the task board and the live view are projections: tables that
nixie updates in the same transaction as the record that changes them, and that nixie can rebuild
from the log. The design runs on SQLite or Postgres, which
[0001](../../decisions/0001-durable-layer.md) leaves open, and names each place where the two
differ. Everything in this doc beyond the decisions it links is a proposal.

## What a record holds

A record is one row of the log. Every record carries the same envelope, and its payload depends on
its kind.

| Field             | Holds                                                                        | Required by                                                                            |
| ----------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Sequence          | A number that orders the record in the log                                   | This design                                                                            |
| Time              | When nixie wrote the record                                                  | This design                                                                            |
| Kind              | Such as `owner_message`, `turn_finished`, `tool_called` or `approval_given`  | This design                                                                            |
| Thread            | The conversation or the task the record belongs to                           | [0018](../../decisions/0018-main-thread-and-tasks.md)                                  |
| Step key          | The task step that wrote it, for idempotent steps                            | [0001](../../decisions/0001-durable-layer.md)                                          |
| Parent            | The record that caused it, such as the tool call behind a worker's records   | [0006](../../decisions/0006-approval-record.md)                                        |
| Source of content | Owner's words, owner's own data, or outside content                          | [0015](../../decisions/0015-taint-scope.md)                                            |
| Decision          | Rule ID, outcome, deciding stage, and auto-mode's reason and inputs          | [0004](../../decisions/0004-rule-engine.md), [0008](../../decisions/0008-auto-mode.md) |
| Prompt cause      | One of the 5 causes, on every record that prompts the owner                  | [0005](../../decisions/0005-effects-and-taint.md)                                      |
| Definitions       | The snapshot hash in force, and the persona and job versions the task pinned | [0013](../../decisions/0013-definition-versioning.md)                                  |
| Approval          | Proposal ID, approval ID and action hash                                     | [0006](../../decisions/0006-approval-record.md)                                        |
| Payload           | The kind's own data, with erasable fields encrypted                          | [0010](../../decisions/0010-memory-store.md)                                           |

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

Crypto-shredding is the one way a record's content leaves. Erasable fields in a payload, such as a
message body or a contact's details, are encrypted with their own key, and forgetting deletes the
key under [0010](../../decisions/0010-memory-store.md). The record stays with its envelope, and a
replay shows a gap where the payload was. Which fields get their own key is open.

## Projections

A projection is a table that answers a question the log answers too slowly, such as "which tasks
wait on a proposal". nixie writes each record and every projection row it changes in one
transaction, so a projection never disagrees with the log at a commit boundary. These projections
serve the core:

- **Task state:** one row per task, with its state, its lease, its open waits and its pinned
  definition versions. [Tasks](./tasks.md) covers it.
- **Proposals and approvals:** each proposal's action hash, status and expiry.
- **Outside actions:** each queued action and its outcome, covered in
  [outside actions](./outside-actions.md).
- **The task board:** one row per task with its status, last update and what it waits on, which
  [0018](../../decisions/0018-main-thread-and-tasks.md) requires.

Every projection can be dropped and rebuilt by folding the log from the first record. A rebuild test
in CI folds a recorded log and compares the result with the live tables.

## The live view and the task board

The live view and the conversation's task board read the same projections, so the owner and the
conversation see the same state, as [0018](../../decisions/0018-main-thread-and-tasks.md) requires.
The task board is the short form: the conversation receives it as a compact list in its newest turn.
The live view is the long form: the client opens a task and reads its records as a conversation,
with each tool call, decision and worker transcript expandable.

The client follows the log by sequence. It loads a projection, notes the last sequence it read, and
then receives every newer record. A record the client cannot render yet still shows by its kind, so
nothing is hidden by a missing renderer.

Following by sequence needs a sequence that orders records by commit, and here the databases differ:

- **SQLite** allows one writer at a time, so an integer primary key grows in commit order, and a
  reader that asks for records after sequence N misses nothing.
- **Postgres** hands out identity values when a transaction asks for them, not when it commits. A
  transaction that takes sequence 101 and commits after the one that took 102 is invisible to a
  reader that has already moved past 102. nixie serialises appends with a transaction-level advisory
  lock, so values are taken and committed in order, at the cost of one append at a time. The
  [event log spike](../open-items.md#spikes-to-run) measures whether one append at a time keeps up
  with one owner's load.

Wake-ups differ too. Postgres has LISTEN and NOTIFY, so a commit can wake the client's stream and
the task runners at once. SQLite on one host uses an in-process signal after each commit, with
polling as the fallback
([storage notes](../../research/2.4-notes/data-and-storage.md#postgres-or-sqlite-for-the-event-log)).

## Memory history and export

Memory lives in its own tables with a history table under
[0010](../../decisions/0010-memory-store.md), not in the log. Every memory write appends a record
that names the memory item and its new version, and the record, the history row and any approval
commit in one transaction. The log holds why a memory changed, and the history table holds what it
changed to.

Retrieval over past conversation searches the log, under
[0024](../../decisions/0024-memory-in-context.md), with keyword search first. A persisted full-text
index, FTS5 on SQLite or `tsvector` on Postgres, keeps the words of an erasable field after its key
is deleted, in the live database and in every backup. Erasable fields therefore stay out of any
persisted index: nixie searches them through an index held in memory and built from the payloads it
can still decrypt, or by decrypting and scanning. Envelope fields and payload fields that are not
erasable can use the database's own full-text index. The
[retrieval spike](../open-items.md#spikes-to-run) decides whether ranked search pays off.

Memory export is a tool and a button under [0010](../../decisions/0010-memory-store.md). The design
proposes that the event log exports the same way: a SQLite file holding the records with decrypted
payloads, which the
[storage notes](../../research/2.4-notes/data-and-storage.md#weighing-the-evidence) favour because
any SQLite reader opens it. A shredded payload stays a gap in the export. Creating an export carries
its own declared effect, as memory export does.

## Retention

The log keeps every record for the life of the deployment by default. The records are small next to
an SDK transcript, and the principle "Nothing is hidden" asks that "why did nixie do this?" has an
answer months later. The owner's erasure route is crypto-shredding, which removes content and keeps
the fact that something happened.

Two stores sit beside the log and need their own rules. Definition snapshots are kept while any
record points at them, so a replay always finds its definitions. The SDK transcript under
`CLAUDE_CONFIG_DIR` is either a store the owner can read and export or a cache that the log
supersedes, which is a [deferred decision](../open-items.md#deferred-decisions).

## Options for the owner

- **The database.** SQLite keeps the log as one file in the process, which is also its export and
  its backup, and `bun:sqlite` blocks the event loop during a long query. Postgres covers a second
  host, wakes readers with LISTEN and NOTIFY, and has the maintained Kysely driver on Bun
  ([storage notes](../../research/2.4-notes/data-and-storage.md#the-drivers-on-bun)). The design
  above works on either. The recommendation is to let the
  [event log spike](../open-items.md#spikes-to-run) and the topology decision settle it, because
  whether nixie ever runs on a second host decides most of the trade-off.
- **Projections beside the log, or the log alone.** The design keeps projection tables written in
  the same transaction. A log-only design folds state on read, which removes any risk of the two
  disagreeing but makes every claim and board read pay for a fold. The recommendation is projection
  tables with the rebuild test.
- **The export format.** A SQLite file opens anywhere and keeps the schema, while JSON lines read in
  any text tool and diff well. The recommendation is the SQLite file, with JSON lines as a later
  addition if the owner wants to read it by hand.

## Open questions

- Which payload fields get their own key and where the owner's backup key lives, carried over from
  [open items](../open-items.md#phase-3-design-tasks). The answer also sets how much of the log the
  database's own full-text index can cover.
- Whether the owner can set a retention period for records, and for which kinds, given that the
  default keeps everything.
- Whether a record that recalled memory stamps the version of each item it read.
- Whether Postgres serialises appends with an advisory lock, as proposed, or tails by transaction
  snapshot instead, which allows parallel appends at the cost of a more complex reader.
