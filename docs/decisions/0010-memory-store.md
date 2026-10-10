# 0010: The memory store

- Date: 2026-10-08
- Status: decided
- Design: [memory store](../design/memory/store.md)
- Research:
  [memory notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.4-notes/memory-models.md)

nixie keeps long-term memory as rows in its own database, SQLite under
[0025](./0025-database-and-topology.md). Each memory item carries its provenance in columns that
nixie sets and the model cannot write: its origin, the task, the source of the content it came from,
and the proposal that created it. The source is one of the 3 that the event log records under
[0015](./0015-taint-scope.md): your words, your own data, or outside content. A history table keeps
every version of each item.

Memory shows in 2 ways:

- **A view** in nixie's client lists every memory item with its provenance and history, and lets you
  edit, retire or delete it.
- **The agent** answers questions about memory from the raw store. A recall tool returns the stored
  items as written, so "what do you remember about X?" gets the items themselves, never the model's
  paraphrase.

## Forgetting

Forgetting is crypto-shredding. nixie encrypts each memory item with its own key, and forgetting
deletes the key. A forget stays pending until local cleanup finishes and every registered backup
drops its copies of the key, under [0032](./0032-offsite-backups-and-replication.md). It reports
completion only when the item is unreadable across that scope. A model provider that already
received the text in a turn sits outside that scope. Saying "forget that" in chat retires an item
with undo, and only a checked action in the client destroys one, under
[0031](./0031-memory-capture-context-and-removal.md).

## Export

You can export all memory to JSON, with provenance and history included. Export is a tool and a
button in the client, and it writes to a place you choose. An export holds decrypted data, so
creating one is an action with its own declared effect under your rules, and nixie cannot send an
export to an outside destination on its own. A forgotten item cannot be exported, because its key is
gone.

## Why

- Transparency means a view to inspect and manage memory, and an agent that answers plainly, not
  files on disk.
- A memory write commits in the same transaction as its approval and its event, so a crash cannot
  leave them disagreeing.
- Rows handle several tasks writing at once.
- Crypto-shredding makes a forget reach backups, which git cannot do without rewriting history.

## Alternatives

- **Markdown files in a git repo.** Any editor edits memory and git versions every write. A true
  forget means rewriting git history, every clone and backup keeps the old version, and the approval
  and the memory change commit separately.
- **Rows with a markdown view.** nixie writes memory out as browsable files, and edits return as
  proposals. Transparency does not need it.
- **Deleting the row to forget.** Older backups keep the item until they rotate out.

## Consequences

- nixie manages a key per memory item, and a replay shows a gap where a forgotten item was.
- Every memory write is a nixie tool with a memory-write effect, so the rules from
  [0004](./0004-rule-engine.md) and the effect rules from [0005](./0005-effects-and-taint.md) apply.
- The same crypto-shredding can cover other erasable fields in the event log, such as a contact's
  details.
