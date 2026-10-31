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

The memory gate is the [content gate](../../../architecture/memory/writes.md#the-content-gate) and
the [retirement intent gate](../../../architecture/memory/writes.md#retirement-intent) together. Its
checks are the quote check, the token check and the memory checker, a model that confirms your
message asserts the memory. Your rules decide a memory write first, and the gate decides a write
that no rule matches, under [0048](../../../decisions/0048-one-approval-system.md).

`memory.remember`, `memory.edit` and `memory.retire` declare the `memory_write` effect, whoever
calls them: the conversation, a task or the memory writer. Each call goes through the
[decision point](../policy/decision-point.md) like any other tool call, and the rules that match it
decide what happens:

| The rules for the write | What happens                                             |
| ----------------------- | -------------------------------------------------------- |
| A deny rule matches     | The decision point denies the call                       |
| An ask rule matches     | The write becomes a memory proposal                      |
| An allow rule matches   | The token check runs, and the other 2 checks are skipped |
| No rule matches         | Every check of the gate runs                             |

A deny rule's sentence reaches the model as the tool result, and an ask rule is the proposal's
review reason. Under an allow rule, a write that fails the token check becomes a proposal, and one
that passes applies at once. Every write that applies takes a notice with undo.

For a memory write, the gate takes the place of the decision point's consent stage and its "no rule
matched" stage. The consent checker, which confirms that your message asked for an action, therefore
never lets a direct "remember that" skip the quote check or the memory checker.

A rule on `memory_write` can match where the write's content came from, `owner`, `own_data`, `task`
or `outside`, through the `sources` field of the [rule format](../policy/rules.md#the-rule-format).
No starter rule matches `memory_write`, so every memory write runs the full gate until you write a
rule for it. **Why:** the gate's checks let your own typed words apply at once, and a rule that
allows `outside` lets a page that the conversation fetched write a memory that every later prompt
reads.

A pin, an unpin, a rating, a comment, a consolidator suggestion and a self-note declare `note`. Each
one either changes nothing you rely on or produces a proposal, so the starter rule `allow-notes`
lets the call run and the proposal still waits for you.

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
