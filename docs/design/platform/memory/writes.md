# Memory writes

- Decisions: [0002](../../../decisions/0002-approvals.md),
  [0008](../../../decisions/0008-memory-write-review.md),
  [0005](../../../decisions/0005-untrusted-conversation.md)

The [memory writes](../../../architecture/memory/writes.md) architecture doc covers the content
gate, the retirement intent gate, provenance, memory proposals and notices as built. This design
covers the parts still to build: the rule lookup in front of the gate, and what the client shows for
a proposal and a notice.

## The gate as a rule lookup

The memory gate is the [content gate](../../../architecture/memory/writes.md#the-content-gate) and
the [retirement intent gate](../../../architecture/memory/writes.md#retirement-intent) together. The
content gate, on `memory.remember` and `memory.edit`, runs the quote check, the token check and the
memory checker, a model that confirms your message asserts the memory. The retirement intent gate,
on `memory.retire`, runs a read check, the quote check and the memory checker, and no token check,
because a retirement adds no text. Your rules decide a memory write first, and the gate decides a
write that no rule matches.

`memory.remember`, `memory.edit` and `memory.retire` declare the `memory_write` effect, whoever
calls them: the conversation or a task. Each call goes through the
[decision point](../policy/decision-point.md) like any other tool call, and the rules that match it
decide what happens:

| The rules for the write | What happens                                     |
| ----------------------- | ------------------------------------------------ |
| A deny rule matches     | The decision point denies the call               |
| An ask rule matches     | The write becomes a memory proposal              |
| An allow rule matches   | Only the token check runs, on a remember or edit |
| No rule matches         | Every check of the write's gate runs             |

A deny rule's sentence reaches the model as the tool result, and an ask rule is the proposal's
review reason. Under an allow rule, a remember or an edit that fails the token check becomes a
proposal, and one that passes applies at once. A retirement under an allow rule applies at once,
because it has no token check. Every write that applies takes a notice with undo.

For a memory write, the gate takes the place of the decision point's consent stage and its "no rule
matched" stage, as [the pipeline](../policy/decision-point.md#the-pipeline) sets.

A rule on `memory_write` can match where the write's content came from, `owner`, `own_data`, `task`
or `outside`, through the `sources` field of the [rule format](../policy/rules.md#the-rule-format).
No starter rule matches `memory_write`, so every memory write runs the full gate until you write a
rule for it. **Why:** the gate's checks let your own typed words apply at once, and a rule that
allows `outside` lets a page that the conversation fetched write a memory that every later prompt
reads.

A pin, an unpin and a rating declare `note`. Each one either changes nothing you rely on or produces
a proposal, so the starter rule `allow-notes` lets the call run and the proposal still waits for
you. A self-note is a `memory.remember` call, so it declares `memory_write` and runs the gate, which
always makes it a proposal.

## Who writes

The conversation and tasks call `memory.remember` and `memory.retire` during a turn, such as when
you say "remember that I'm vegetarian now". These writes never wait for a batch.

Compaction is not a write path: a compaction summary never becomes memory, as
[compaction](context.md#compaction) covers.

A write whose text matches an active item exactly returns that item and writes nothing. A
near-duplicate is the model's job: the model sees the items retrieval found and revises one instead
of adding a second. A fact that replaces another, such as a new address, revises or retires the old
item. **Why:** the [retrieval spike](../../../../research/memory-retrieval/README.md) found that no
ranking separates a current fact from the one it superseded, so the store never holds both as
active.

## Dictated text

A voice client marks the words it transcribed as `dictated` spans, and dictated text never counts as
evidence. A write whose quote touches a `dictated` span fails the quote check and becomes a
proposal, whatever the rest of the quote holds. A destination token never passes the token check
from dictated text. **Why:** a transcript can mishear a name, a number or an address, so the token
check would match the misheard value, and a microphone also hears a TV or another person, whom a
transcript cannot tell apart from you.

During a call, a memory proposal's card appears in the call screen, as
[channel approvals](../channels/approvals.md#during-a-voice-call) covers, so a dictated fact costs
one tap.

## Memory proposals

A memory proposal is a routine proposal in the approval digest. Its card shows the quote inside its
source message, or "no quote from you", and its review reason. A memory proposal is not a prompt
cause, as [proposals and approvals](../policy/approvals.md#the-proposal) sets, and the live view
counts proposals by review reason. **Why:** the counts show which check sends the most writes to
review.

When an approval fails as stale, the client offers the proposal against the current version.
Stopping a task withdraws its open memory proposals with its other proposals.

## Notices and undo

The client groups one turn's writes, or one batch's writes, into a compact notice under the reply:
"Remembered 3 things · View" expands to the items, each with undo bound to the version written.
Retirement uses the same grouping with its own label. A batch that finishes after the reply adds a
quiet notice in that thread, with no push and no entry in the approval digest. A task's writes
appear in its thread and in its next report to the conversation. A notice also links the checked
[forget](../../../architecture/memory/store.md#forgetting) action.
