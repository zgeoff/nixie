# 0011: Which memory writes skip review

- Date: 2026-10-08
- Updated: 2026-11-11
- Status: decided

## Decision

A memory write applies at once, with a notice and undo, only when all 3 checks pass. Every other
memory write is a proposal, which reads as text the model wrote with your quote kept as its
evidence.

1. **Your typed quote.** The quote appears word for word in text you typed, in a message as nixie
   recorded it. The client records which spans of a message you pasted, and a pasted span, a quoted
   block or a dictated span never counts as evidence.
2. **The token check.** Code checks that every destination-like token in the memory, such as an
   email address, URL, phone number, handle or account number, appears word for word in the quote.
3. **The checker.** A separate checker model confirms that you asserted the memory. It sees your
   whole message, with the quote and the pasted spans marked, and the memory, and never the rest of
   the conversation. A rejection, an unsure answer or no answer makes a proposal.

These rules set the exceptions:

- **Allow rules.** The 3 checks are the default when no rule matches the write. Remember, edit and
  retire declare the `memory_write` effect under [0048](0048-one-approval-system.md). An allow rule
  of yours that matches a memory write lets it apply at once, with a notice and undo, in the
  contexts the rule names, such as the conversation but not job runs. A rule on `memory.remember`
  covers new items and a rule on `memory.edit` covers changes, and neither covers the other. No
  starter rule matches `memory_write`, and creating one is a widening that asks once. The token
  check still runs under a rule, against text you typed or your definitions, and a write that fails
  it is a proposal whatever the rule says.
- **Self-notes.** A self-note is an item that nixie writes about itself. Every self-note is a
  proposal, and only the conversation writes one. An allow rule that skips its review must name that
  kind of item. You can pin an active self-note, and it reaches the conversation labelled with its
  model and date.
- **Pins.** `memory.pin` pins an existing item, as a proposal unless an allow rule names
  `memory.pin`. `memory.remember` takes no pin, so a new fact that nixie wants pinned is a memory
  and then a pin. `memory.unpin` applies at once, with no review and no undo, because the item stays
  in memory and still comes up when it's relevant, and you pin it again from the memory view. nixie
  sees the pinned count and the core's budget, and only the budget refuses a pin.
- **Photos.** A photo and the text in it never count as your words. A memory from a photo is a
  proposal that shows the photo, whatever quote it gives, unless an allow rule names the photo
  source.
- **Dictated text.** A write whose quote touches a `dictated` span is a proposal, and during a call
  its card shows in the call screen under [0041](0041-approvals-during-a-voice-call.md). A
  destination token never passes the token check from dictated text, even if a later decision
  relaxes the rest of this rule.
- **Retirement.** Retiring an item from chat, as "forget that" does under
  [0031](0031-memory-capture-context-and-removal.md), needs your typed intent and the exact item and
  version, and the checker tests the request against that item. It carries no new content, so it
  needs no destination token repeated.
- **No bulk rewrite.** No built-in task merges or rewrites items under
  [0050](0050-no-built-in-memory-tasks.md). Each rewrite by a task is a write of its own. A proposal
  never blocks: you answer it when you choose, singly or through the approval digest of
  [0006](0006-approval-record.md).

## Why

- The conversation is always untrusted under [0005](0005-effects-and-taint.md#where-taint-applies),
  so it cannot decide which writes are safe. Your own words can, and injected content cannot place
  text in your message.
- A real quote does not prove that it supports the memory. The checker closes that gap, and the
  token check stops a memory that points nixie at an attacker's destination, whatever the checker
  says.
- The checker follows [0008](0008-auto-mode.md): a model decides a grey zone, can only make the
  outcome stricter, and fails closed.
- In the model-eval spike, an exact quote for each memory brought several models to 0 invented
  entries, where a summary prompt invented facts on every model.
- You set the risk stance for memory as you do for every other tool.
- A memory write is reversible, unlike a send, so a wrong memory is visible and can be undone, and
  an allow rule can trade review for fewer proposals where you accept the risk, with the token check
  as a floor.
- A transcript can mishear a name, a number or an address, and the token check would then pass the
  wrong value, because it matches a quote that holds the same wrong value.
- A microphone also hears a TV, a video or another person, and a transcript cannot show who spoke,
  so other voices would be a route for injected memories. The card shows in the call screen, so a
  proposal from dictated text costs one tap during the call.
- A self-note has no words of yours behind it, and the pinned core opens every session, so you
  decide what goes in it.

## Rejected alternatives

| Option                                                | Why not                                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| every write as a proposal                             | memory feeds a steady stream into the approval digest, against the 0-prompt target                                                                            |
| only writes you ask for apply at once                 | each fact you state in passing would need approval                                                                                                            |
| store your quote itself as the memory                 | memories read as raw quotes, not natural text                                                                                                                 |
| the quote check alone                                 | a steered model can attach an unrelated real quote to a poisoned memory                                                                                       |
| rules that can only ask or deny a memory write        | every write the checks cannot back stays a proposal, even where you accept the risk                                                                           |
| an allow rule that skips every check                  | injected content could plant a destination in memory with no review                                                                                           |
| dictated text counts as evidence                      | misheard facts and other voices reach memory unchecked                                                                                                        |
| dictated text counts, except with a destination token | misheard names and other voices still get through; it is the fallback if proposals from dictated text become a burden                                         |
| consolidation as one proposal that shows the diff     | a built-in task is a second way to do the same job, with its own config, model role, prompt and tools to keep, under [0050](0050-no-built-in-memory-tasks.md) |
| a checker that sees only the quote                    | it cannot tell a statement from a question, a negation or a quotation                                                                                         |

## Consequences

- Undo uses the history table of [0010](0010-memory-store.md), and permanent deletion uses its
  crypto-shredding.
- A fact that reaches nixie only through outside content, such as a flight time in an email, needs
  approval before it becomes a memory.
- The live view counts proposals by review reason, and those counts are the evidence for a revisit
  of the dictated-text rule.

## Changes

- 2026-10-11: an allow rule of yours that names `memory.remember` lets a write apply at once, with
  the token check kept as a floor.
- 2026-10-11: dictated text never counts as evidence, so a write that quotes it is a proposal.
- 2026-10-12: a self-note, which nixie writes about itself, is a new kind of item. It is always a
  proposal, never pinned, and labelled with its model and date. An allow rule that skips review for
  it must name the kind.
- 2026-10-14: an allow rule covers only the tool it names, so a rule on `memory.remember` never
  covers an edit through `memory.edit`.
- 2026-10-15: record 0042, Dictated text and memory, merged into this record.
- 2026-10-18: you can pin an active self-note, as you can pin an item of any subject.
- 2026-10-20: a memory from a photo is a proposal by default, and only an allow rule that names the
  photo source skips its review.
- 2026-10-22: nixie pins an existing item through `memory.pin`, a proposal unless an allow rule
  names the tool, and unpins at once through `memory.unpin`. `memory.remember` takes no pin, and
  nixie sees the pinned count and the core's tokens against its budget.
- 2026-10-31: remember, edit and retire declare `memory_write` under 0048, so these checks are the
  default when no rule matches, and the starter rule that allows notes no longer reaches them.
- 2026-11-11: the built-in consolidator is deleted under 0050, so no bulk rewrite arrives as one
  diff, and each rewrite by a task is a write of its own.
