# 0011: Which memory writes skip review

- Date: 2026-10-08
- Status: decided
- Design: [memory writes](../design/memory/writes.md)
- Research: [memory checks spike](../../spikes/memory-checks/),
  [memory notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.4-notes/memory-models.md)

A memory write applies at once, with a notice and undo, only when all 3 checks pass:

1. Its quote appears word for word in text you typed, in a message as nixie recorded it. The client
   records which spans of a message you pasted, and a pasted span or a quoted block never counts as
   evidence.
2. Every destination-like token in the memory, such as an email address, URL, phone number, handle
   or account number, appears word for word in that quote. Code runs this check.
3. A separate checker model confirms that you asserted the memory. It sees your whole message, with
   the quote and the pasted spans marked, and the memory, and never the rest of the conversation, so
   it can tell a statement from a question, a negation or a quotation.

Every other memory write is a proposal, including a write the checker rejects, is unsure about or
cannot reach. The memory reads as text the model wrote, with your quote kept as its evidence.

Retiring an item from chat, as "forget that" does under
[0031](./0031-memory-capture-context-and-removal.md), carries no new content. It needs your typed
intent and the exact item and version, and the checker tests the request against that item. It does
not need the old fact's destination tokens repeated.

Consolidation, which merges or rewrites existing memory items in bulk, is a proposal that shows the
diff. Every proposal is asynchronous and never blocks: the task and the conversation carry on, and
you answer when you choose, singly or through the approval digest from
[0006](./0006-approval-record.md).

## Why

- The conversation is always untrusted under [0015](./0015-taint-scope.md), so it cannot decide
  which writes are safe. Your own words can.
- Injected content cannot place text in your message, so a quote check that nixie runs against its
  own record cannot be steered by injection.
- A real quote does not prove that it supports the memory: a steered model could attach a real but
  unrelated quote to a poisoned memory. The checker closes that gap, and the token check stops the
  most harmful case, a memory that points nixie at an attacker's destination, whatever the checker
  says.
- The checker follows the pattern of [0008](./0008-auto-mode.md): a model decides a grey zone, can
  only make the outcome stricter, and fails closed.
- In the model-eval spike, requiring an exact quote for each memory brought several models to 0
  invented entries, where a plain summary prompt invented facts on every model.
- A memory write is reversible, unlike a send, so a wrong memory is visible and can be undone.

## Alternatives

- **Every write as a proposal.** It is the safest, and memory then feeds a steady stream into the
  approval digest, against the 0-prompt target.
- **Only writes you ask for apply at once.** Facts you state in passing would each need approval.
- **Store your quote itself as the memory.** It needs no checker model, and memories read as raw
  quotes rather than natural text.
- **The quote check alone.** It lets a steered model attach an unrelated quote to a poisoned memory.
- **A checker that sees only the quote.** You may paste a scam email and ask about it, quote
  someone, or negate a fact. Without the whole message, the checker cannot tell.

## Consequences

- Undo for a memory write uses the history table from [0010](./0010-memory-store.md), and permanent
  deletion uses its crypto-shredding.
- A fact that reaches nixie only through outside content, such as a flight time in an email, needs
  approval before it becomes a memory.
