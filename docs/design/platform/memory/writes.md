# Memory writes

- Decisions: [0002](../../../decisions/0002-approvals.md),
  [0006](../../../decisions/0006-approval-record.md),
  [0011](../../../decisions/0011-memory-writes.md),
  [0005](../../../decisions/0005-effects-and-taint.md),
  [0031](../../../decisions/0031-memory-capture-context-and-removal.md),
  [0048](../../../decisions/0048-one-approval-system.md)

The [memory writes](../../../architecture/memory/writes.md) architecture doc covers the content
gate, the retirement intent gate, provenance, memory proposals and notices as built. This design
covers the parts still to build: the rule lookup in front of the gate, the memory writer that
captures facts from batches of turns, and what the client shows for a proposal and a notice.

## The gate as a rule lookup

`memory.remember`, `memory.edit` and `memory.retire` declare the `memory_write` effect, from the
conversation, a task and the memory writer, under
[0048](../../../decisions/0048-one-approval-system.md). A write through one of them passes the
[decision point](../policy/decision-point.md) like any other tool call, and the gate asks the rule
engine first:

| The rules for the write | What happens                                                                    |
| ----------------------- | ------------------------------------------------------------------------------- |
| A deny rule matches     | The call is denied, and the model reads the rule's sentence                     |
| An ask rule matches     | The write becomes a proposal, with your ask rule as its review reason           |
| An allow rule matches   | The write applies at once after the token check, with a notice and undo         |
| No rule matches         | The gate runs in full, as the architecture doc describes, and its checks decide |

A rule on `memory_write` can match the write's content source, `owner`, `own_data`, `task` or
`outside`, through the `sources` field of the [rule format](../policy/rules.md#the-rule-format). No
starter rule matches `memory_write`, so every write runs the full gate until you write a rule for
it. For a memory write, the gate takes the place of the consent stage and the "no rule matched"
stage, so a direct "remember that" still passes the quote check and the checker. **Why:** the gate's
own checks are the default, and a rule that allows `outside` lets a page that the conversation
fetched write a memory that every later prompt reads.

An allow rule never skips the token check, as [0011](../../../decisions/0011-memory-writes.md)
holds, so a write that fails it becomes a proposal whatever the rule says.

The other memory writes keep `note`: a pin, an unpin, a rating, a comment, a consolidator suggestion
and a self-note. Each is harmless or produces a proposal, so the starter rule `allow-notes` lets the
call run and leaves its review in place.

## Who writes

Memory has 2 write paths, and SDK compaction stays in place:

- **The conversation and tasks** call `memory.remember` and `memory.retire` during a turn, such as
  when you say "remember that I'm vegetarian now". These writes never wait for a batch.
- **The memory writer** captures passing facts from batches of committed conversation turns. A small
  model reads your original messages in order, the replies, and the relevant current items. Its only
  tools are `memory.recall`, `memory.remember` and `memory.retire`, and it supplies an exact quote
  for each candidate.

[The memory writer](../../../architecture/memory/writer.md) describes the built writer: its batch
triggers, its sandbox, its sessions and how it publishes.

A write whose text matches an active item exactly returns that item and writes nothing. A
near-duplicate is the model's job: the writer sees the items retrieval found and revises one instead
of adding a second. A fact that replaces another, such as a new address, revises or retires the old
item. **Why:** the [retrieval spike](../../../../research/memory-retrieval/README.md) found that no
ranking separates a current fact from the one it superseded, so the store never holds both as
active.

### Batch boundaries and recovery

[The memory writer](../../../architecture/memory/writer.md#publishing) describes how a batch
publishes in one transaction and how a crash at any point leaves it published once. The
[offline batch spike](https://github.com/zgeoff/nixie/tree/e232631a587680970a5c8804455415e7f97140bc/docs/design/platform/spikes/memory-batch/)
tested this cursor under process kills.

## The gate for writer batches

The writer's writes pass the same [content gate](../../../architecture/memory/writes.md) as a
conversation write, with 2 differences. A batch write resolves the source record its candidate
selected, instead of searching the thread's latest messages, and a quote outside that batch becomes
a proposal. A job run has no messages from you, so every write from a job run is a proposal unless
your allow rule covers job runs.

## Dictated text

A voice client marks the words it transcribed as `dictated` spans, and dictated text never counts as
evidence, under [0011](../../../decisions/0011-memory-writes.md). A write whose quote touches a
`dictated` span fails the quote check and becomes a proposal, whatever the rest of the quote holds.
A destination token never passes the token check from dictated text. **Why:** a transcript can
mishear a name, a number or an address, so the token check would match the misheard value, and a
microphone also hears a TV or another person, whom a transcript cannot tell apart from you.

During a call, a memory proposal's card appears in the call screen, as
[channel approvals](../channels/approvals.md#during-a-voice-call) covers, so a dictated fact costs
one tap.

## Memory proposals

A memory proposal is a routine proposal in the approval digest. Its card shows the quote inside its
source message, or "no quote from you", and its review reason. A memory proposal is not a prompt
cause under [0028](../../../decisions/0028-policy-design.md), and the live view counts proposals by
review reason. **Why:** the counts show which check sends the most writes to review.

When an approval fails as stale, the client offers the proposal against the current version.
Stopping a task withdraws its open memory proposals with its other proposals.

## Notices and undo

The client groups one turn's writes, or one batch's writes, into a compact notice under the reply:
"Remembered 3 things · View" expands to the items, each with undo bound to the version written.
Retirement uses the same grouping with its own label. A batch that finishes after the reply adds a
quiet notice in that thread, with no push and no entry in the approval digest. A task's writes
appear in its thread and in its next report to the conversation. A notice also links the checked
[forget](../../../architecture/memory/store.md#forgetting) action.
