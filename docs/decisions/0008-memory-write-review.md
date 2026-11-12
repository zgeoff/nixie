# 0008: A memory write skips review only on your quote, a token check and a checker

- Date: 2026-10-08
- Status: decided

## Decision

When no allow rule of yours matches a memory write, the write applies at once, with a notice and
undo, only when all 3 checks pass. Every other memory write is a proposal, which reads as text the
model wrote with your quote kept as its evidence. The
[memory writes](../architecture/memory/writes.md) doc states the allow rules and the other
exceptions.

1. **Your typed quote.** The quote appears word for word in text you typed, in a message as nixie
   recorded it.
2. **The token check.** Code checks that every destination-like token in the memory, such as an
   email address, URL, phone number, handle or account number, appears word for word in the quote.
3. **The checker.** A separate checker model confirms that you asserted the memory. It sees your
   whole message, with the quote and any pasted text marked, and the memory, and never the rest of
   the conversation. A rejection, an unsure answer or no answer makes a proposal.

## Why

- The conversation is always untrusted under [0005](0005-untrusted-conversation.md), so it cannot
  decide which writes are safe. Your own words can, and injected content cannot place text in your
  message.
- A real quote does not prove that it supports the memory. The checker closes that gap, and the
  token check stops a memory that points nixie at an attacker's destination, whatever the checker
  says.
- The checker can only make the outcome stricter, and it fails closed.
- In the [model-eval spike](../../research/model-eval/), an exact quote for each memory brought
  several models to 0 invented entries, where a summary prompt invented facts on every model.
- A memory write is reversible, unlike a send, so a wrong memory is visible and can be undone.

## Rejected alternatives

| Option                                | Why not                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| every write as a proposal             | memory feeds a steady stream into the approval digest, against the 0-prompt target |
| only writes you ask for apply at once | each fact you state in passing would need approval                                 |
| store your quote itself as the memory | memories read as raw quotes, not natural text                                      |
| the quote check alone                 | a steered model can attach an unrelated real quote to a poisoned memory            |
| a checker that sees only the quote    | it cannot tell a statement from a question, a negation or a quotation              |

## Consequences

- Undo uses the item's history, and permanent deletion uses the crypto-shredding of
  [0007](0007-crypto-shredding.md).
- A fact that reaches nixie only through outside content, such as a flight time in an email, needs
  approval before it becomes a memory.
