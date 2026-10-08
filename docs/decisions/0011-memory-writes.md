# 0011: Which memory writes skip review

- Date: 2026-10-08
- Status: decided
- Research: [memory notes](../research/2.4-notes/memory-models.md),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md#memory)

A memory write backed by an exact quote from the owner's own message applies at once, and the owner
sees it and can undo it. nixie checks deterministically that the quote appears in the owner's
message as nixie recorded it. Every other memory write is a proposal, including memories derived
from outside content and memories the model infers. Consolidation, which merges or rewrites existing
memory items in bulk, is a proposal that shows the diff.

Every proposal is asynchronous and never blocks: the task and the conversation carry on, and the
owner answers when they choose, singly or through the digest sheet from
[0006](./0006-approval-record.md).

## Why

- The conversation is always untrusted under [0015](./0015-taint-scope.md), so the conversation
  cannot decide which writes are safe. The owner's own words can: only the owner restating a fact
  makes it trusted.
- Injected content cannot place text in the owner's message, so a quote check that nixie runs
  against its own record cannot be steered by injection.
- The model-eval spike found that requiring an exact owner quote for each memory brought several
  models to 0 invented entries, where a plain summary prompt invented facts on every model.
- A memory write is reversible, unlike a send. A wrong memory, such as the model misreading the
  owner, is visible and can be undone.
- Consolidation changes many items the owner knows, so the owner sees the diff before it applies.

## Alternatives

- **Every write as a proposal.** It is the safest, and memory then feeds a steady stream into the
  digest, against the 0-prompt target.
- **Only writes the owner asks for apply at once,** as the research recommended. Facts the owner
  states in passing would each need approval.
- **Writes from a clean main thread apply at once.** This was the first version of this decision.
  The conversation is never clean under 0015, so it would make every write a proposal.

## Consequences

- The event log is highly available to the owner and designed for UX. The goal, not a v0 or v1
  requirement: one tap on a notice such as "nixie stored 3 memories" shows those 3 items, and the
  owner can edit or purge each one on the spot.
- Undo for a memory write uses the history table from [0010](./0010-memory-store.md), and purge uses
  its crypto-shredding.
- A fact that reaches nixie only through outside content, such as a flight time in an email, needs
  approval before it becomes a memory.
