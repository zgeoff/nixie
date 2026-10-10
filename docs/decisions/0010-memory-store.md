# 0010: The memory store

- Date: 2026-10-08
- Status: decided, amended by [0011](./0011-memory-writes.md), [0015](./0015-taint-scope.md),
  [0031](./0031-memory-capture-context-and-removal.md) and
  [0032](./0032-offsite-backups-and-replication.md)
- Research: [memory notes](../research/2.4-notes/memory-models.md),
  [storage notes](../research/2.4-notes/data-and-storage.md),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md#memory)

nixie keeps long-term memory as rows in its own database, SQLite under
[0025](./0025-database-and-topology.md). Each memory item carries its provenance in columns that
nixie sets and the model cannot write: its origin, the task, the source of the content it came from,
and the proposal that created it. The source is one of the 3 that the event log records under
[0015](./0015-taint-scope.md): the owner's words, the owner's own data, or outside content. A
history table keeps every version of each item.

The owner sees memory in 2 ways:

- **A UI** in nixie's client lists every memory item with its provenance and history, and lets the
  owner edit or delete it.
- **The agent** answers questions about memory from the raw store. A tool returns the stored items
  as written, so "what do you remember about X?" gets the items themselves, never the model's
  paraphrase.

Forgetting is crypto-shredding. nixie encrypts each memory item with its own key, and forgetting
deletes the key. The operation remains pending until local cleanup and removal of recoverable key
copies from every registered backup finish under [0032](./0032-offsite-backups-and-replication.md).
It reports completion only when the item is unreadable across that scope; it does not report success
while a scheduled backup cleanup still waits.

## Export

The owner can export all memory to a plain, documented format, such as JSON or markdown files, with
provenance and history included. Export is a tool and a button in the client, and it writes to a
place the owner chooses. An export holds decrypted data, so creating one is an action with its own
declared effect under the owner's rules, and nixie cannot send an export to an outside destination
on its own. A forgotten item cannot be exported, because its key is gone.

## Why

- Transparency for the owner means a UI to inspect and manage memory, and an agent that answers
  plainly, not files on disk.
- A memory write commits in the same transaction as its approval and its event, so a crash cannot
  leave them disagreeing.
- Rows handle several tasks from [0018](./0018-main-thread-and-tasks.md) writing at once.
- Crypto-shredding makes "forget that" true in backups as well, which git cannot do without
  rewriting history.

## Alternatives

- **Markdown files in a git repo,** which the research recommended. The owner edits memory in any
  editor and git versions every write. A true forget means rewriting git history, every clone and
  backup keeps the old version, and the approval and the memory change commit separately.
- **Rows with a markdown view.** nixie writes memory out as files the owner can browse, and edits
  return as proposals. The owner's view of transparency does not need it.
- **Deleting the row to forget.** Older backups keep the item until they rotate out.

## Consequences

- nixie manages a key per memory item, and a replay shows a gap where a forgotten item was.
- Every memory write is a nixie tool with a memory-write effect, so the rules from
  [0004](./0004-rule-engine.md) and the effect rules from [0005](./0005-effects-and-taint.md) apply.
- [0011](./0011-memory-writes.md) decides which memory writes skip review, and makes consolidation a
  proposal that shows the diff.
- The same crypto-shredding can cover other erasable fields in the event log, such as a contact's
  details.
