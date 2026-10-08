# 0010: The memory store

- Date: 2026-10-08
- Status: decided
- Research: [memory notes](../research/2.4-notes/memory-models.md),
  [storage notes](../research/2.4-notes/data-and-storage.md),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md#memory)

nixie keeps long-term memory as rows in its own database, which Phase 3 picks. Each memory item
carries its provenance in columns that nixie sets and the model cannot write: its origin, the task,
whether the main thread was tainted, and the proposal that created it. A history table keeps every
version of each item.

The owner sees memory in 2 ways:

- **A UI** in nixie's client lists every memory item with its provenance and history, and lets the
  owner edit or delete it.
- **The agent** answers questions about memory from the raw store. A tool returns the stored items
  as written, so "what do you remember about X?" gets the items themselves, never the model's
  paraphrase.

Forgetting is crypto-shredding. nixie encrypts each memory item with its own key, and forgetting
deletes the key, so the item becomes unreadable in the live database and in every backup at once.

## Why

- Transparency for the owner means a UI to inspect and manage memory, and an agent that answers
  plainly, not files on disk.
- A memory write commits in the same transaction as its approval and its event, so a crash cannot
  leave them disagreeing.
- Rows handle several main threads writing at once.
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
  [0004](./0004-rule-engine.md) and the taint rules from [0005](./0005-effects-and-taint.md) apply.
- Which memory writes skip review, and how consolidation runs, stay open.
- The same crypto-shredding can cover other erasable fields in the event log, such as a contact's
  details.
