# 0011: Which memory writes skip review

- Date: 2026-10-08
- Status: decided
- Research: [memory notes](../research/2.4-notes/memory-models.md),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md#memory)

A memory write from a clean main thread applies at once, and the owner sees it and can undo it. A
memory write from a tainted main thread, under [0005](./0005-effects-and-taint.md), is always a
proposal. Consolidation, which merges or rewrites existing memory items in bulk, is a proposal that
shows the diff.

Every proposal is asynchronous and never blocks: the task and the conversation carry on, and the
owner answers when they choose, singly or through the digest sheet from
[0006](./0006-approval-record.md).

## Why

- Memory poisoning needs outside content, and taint marks every main thread that has consumed some.
  A clean main thread cannot be steered by injection, so gating its writes adds prompts without
  adding protection.
- A memory write is reversible, unlike a send. A wrong memory from a clean thread, such as the model
  misreading the owner, is visible and can be undone.
- Consolidation changes many items the owner already knows, so the owner sees the diff before it
  applies.

## Alternatives

- **Every write as a proposal.** It is the safest, and memory then feeds a steady stream into the
  digest, against the 0-prompt target.
- **Only writes the owner asks for apply at once,** as the research recommended. Memories the model
  infers from a clean conversation with the owner would each need approval.

## Consequences

- The event log is highly available to the owner and designed for UX. The goal, not a v0 or v1
  requirement: one tap on a notice such as "nixie stored 3 memories" shows those 3 items, and the
  owner can edit or purge each one on the spot.
- Undo for a memory write uses the history table from [0010](./0010-memory-store.md), and purge uses
  its crypto-shredding.
