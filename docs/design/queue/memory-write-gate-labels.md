# The write gate's checks on labels

The [write gate](memory-write-gate.md) checks the labels of a memory item as it checks the item's
text, and it sends every edit that changes only labels to your review. The labels are the item's
gist, its topic and its triggers: [memory labels](memory-labels.md) owns them. The checks exist
because nixie shows each gist in the memory index at the start of every session, and nixie places an
item in a turn when a message matches one of the item's triggers. This doc covers the 2 checks on
labels and the label-only edit.

The terms `review reason`, `evidence window`, `destination-like token`, `checker` and `allow rule`
are defined in [the write gate](memory-write-gate.md#terms). The other terms are in the
[glossary](../../glossary.md).

The sketches in `sketches/memory-gate/` hold each type, each flow and the exact text of each
sentence that the agent reads. This doc holds the rules. Open items are in
[the open list](open/memory-gate.md), each marked here as `(open: <name>)`.

## Built

This section states what the code does. Every section after it states the design.

- The write gate checks only the text of a write, in `runContentGate`, `runSelfNoteGate` and
  `runImageGate`. Each tests the text for a hidden character, which is any Unicode format character.
- `findMissingToken` finds a destination-like token of the text that a second text lacks.
  `runQuotedGate` calls it with the quote. `runRuleGate` calls it with everything you typed in the
  evidence window, for a write under an allow rule. `readTokenVerdict` does the same for a self-note
  and for a write from a photo.
- `buildGateReview` stores a token verdict in a proposal's `checks`.
- `memory.edit` takes a target version and a text.

## Labels on a text write

A text write is a `memory.remember`, or a `memory.edit` that gives `text`. Usage:
[a text write that carries labels](sketches/memory-gate/01-usage.ts), section B. Flow:
[the content gate](sketches/memory-gate/03-flow.ts), section D.

- The write gate runs 2 of its checks on the labels of a text write: the hidden-character check and
  the token check. It runs each check once, over the text and the labels together.
- **Hidden character.** The gate tests `gist`, `topic` and each trigger for a hidden character, as
  it tests the text. When a label holds one, nixie writes a proposal with the review reason
  `invisible_character`.
- **Token check.** The gate collects the destination-like tokens of `gist`, `topic` and every
  trigger with the tokens of the text. Each collected token must appear in the place where the
  write's kind requires the tokens of the text:
  - in the quote, for a write with a quote;
  - in everything you typed in the evidence window, for a self-note, a write from a photo and a
    write under an allow rule.

  When a token is missing, nixie writes a proposal with the review reason `token_missing`.

- nixie never sends a label to the checker. The checker confirms that your words state the item's
  text, and a label is a summary or a keyword of that text, so the checker has nothing to confirm in
  it.
- When the labels and the text pass both checks and every other check of the gate, nixie applies the
  write at once, as it applies a write with no label.

## A label-only edit

A label-only edit is a `memory.edit` that changes labels and gives no `text`. Usage:
[a label-only edit](sketches/memory-gate/01-usage.ts), section C. Flow:
[a label-only edit as code](sketches/memory-gate/03-flow.ts), section G.

- nixie writes a proposal for every label-only edit, whether the conversation or a task calls it.
  The gate has no check that can pass such an edit: you typed no words that a label quotes. An allow
  rule of yours never lets a label-only edit skip review.
- The review reason is `labels`. The one exception is a label with a hidden character, which gives
  `invisible_character`.
- The gate also runs the token check, against the text of the item's active version: each
  destination-like token of a label must appear in that text. The gate does not read a thread for
  this check, for any caller. A task's thread holds none of your messages, so a check against the
  caller's thread would fail every such label from a task.
- The token check never changes the reason. The gate stores its verdict in the proposal's checks:
  `pass` when the item's text holds each token, and `fail` when a token is missing.
- The checker does not run.
- A label-only proposal counts toward [the proposal cap](memory-write-gate.md#the-proposal-cap) of
  its turn as any proposal does. That section states what nixie does past the cap.
- When you approve a label-only proposal, nixie writes one `memory.labelled` record with exactly the
  labels you reviewed. [Memory labels](memory-labels.md) owns that record, the proposal's stored
  shape and the approval flow.

## The review reason `labels`

- `reviewReasons` holds `labels`. The agent reads the reason's sentence in the result of the
  `memory.edit` call. Text: [the sentence of each reason](sketches/memory-gate/02-types.ts),
  sections B and C.
- nixie never gives a label-only edit the reason `no_quote`. With that reason the agent reads that a
  quote was missing or not found, and a label-only edit has no place for a quote.
- The web review screen shows you a sentence of its own for each reason. Its sentence for `labels`
  is not written `(open: labels web text)`.

## Not in scope

- A gate setting for labels. The gate has none.
- A batch operation, or any special path, that gives first labels to items that have none. The agent
  labels those items in the conversation with label-only edits, under the proposal cap, and you
  answer each proposal.
- The label fields, the label records, the proposal's stored shape and the approval flow: see
  [memory labels](memory-labels.md).
- A checker verdict on a gist, and a change to the checker's prompt.
