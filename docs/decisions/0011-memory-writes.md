# 0011: Which memory writes skip review

- Date: 2026-10-08
- Status: decided, amended by [0031](./0031-memory-capture-context-and-removal.md)
- Research: [memory notes](../research/2.4-notes/memory-models.md),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md#memory)

A memory write applies at once, and the owner sees it and can undo it, only when all 3 checks pass:

1. Its quote appears word for word in text the owner typed, in a message as nixie recorded it. The
   client records which spans of a message the owner pasted, and a pasted span or a quoted block
   never counts as evidence.
2. Every destination-like token in the memory, such as an email address, URL, phone number, handle
   or account number, appears word for word in that quote. Code runs this check.
3. A separate checker model confirms that the owner asserted the memory. It sees the owner's whole
   message, with the quote and the pasted spans marked, and the memory, and never the rest of the
   conversation, so it can tell a statement from a question, a negation or a quotation.

Every other memory write is a proposal, including a write the checker rejects, is unsure about or
cannot reach. The memory reads as text the model wrote, with the owner's quote kept as its evidence.

Consolidation, which merges or rewrites existing memory items in bulk, is a proposal that shows the
diff.

Every proposal is asynchronous and never blocks: the task and the conversation carry on, and the
owner answers when they choose, singly or through the digest sheet from
[0006](./0006-approval-record.md).

## Why

- The conversation is always untrusted under [0015](./0015-taint-scope.md), so the conversation
  cannot decide which writes are safe. The owner's own words can: only the owner restating a fact
  makes it trusted.
- Injected content cannot place text in the owner's message, so a quote check that nixie runs
  against its own record cannot be steered by injection.
- A quote that exists does not prove it supports the memory: a steered model could attach a real but
  unrelated quote to a poisoned memory. The checker closes that gap, and the token check stops the
  most harmful case, a memory that points nixie at an attacker's destination, whatever the checker
  says.
- The checker follows the pattern of [0008](./0008-auto-mode.md): a model decides a grey zone, can
  only make the outcome stricter, and fails closed.
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
- **Writes from a clean main thread apply at once.** The conversation is never clean under 0015, so
  it would make every write a proposal.
- **Store the owner's quote itself as the memory.** It needs no checker model, and stored memories
  read as raw quotes rather than natural text.
- **The quote check alone.** It lets a steered model attach an unrelated quote to a poisoned memory.
- **A checker that sees only the quote.** A quote in the owner's message is not always something the
  owner asserted: the owner may paste a scam email and ask about it, quote someone, or negate a
  fact. Without the whole message, the checker cannot tell.

## Consequences

- The event log is highly available to the owner and designed for UX. The goal, not a v0 or v1
  requirement: one tap on a notice such as "nixie stored 3 memories" shows those 3 items, and the
  owner can edit or purge each one on the spot.
- Undo for a memory write uses the history table from [0010](./0010-memory-store.md), and purge uses
  its crypto-shredding.
- A fact that reaches nixie only through outside content, such as a flight time in an email, needs
  approval before it becomes a memory.
