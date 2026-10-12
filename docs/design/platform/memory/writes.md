# Memory writes

- Decisions: [0002](../../../decisions/0002-approvals.md),
  [0006](../../../decisions/0006-approval-record.md),
  [0011](../../../decisions/0011-memory-writes.md), [0015](../../../decisions/0015-taint-scope.md),
  [0031](../../../decisions/0031-memory-capture-context-and-removal.md)

The [memory writes](../../../architecture/memory/writes.md) architecture doc covers the content
gate, the retirement intent gate, provenance, memory proposals and notices as built. This design
covers the parts still to build: the memory writer that captures facts from batches of turns, what
the client shows for a proposal and a notice, and consolidation.

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
item. **Why:** the [retrieval spike](../spikes/memory-retrieval/README.md) found that no ranking
separates a current fact from the one it superseded, so the store never holds both as active.

### Batch boundaries and recovery

[The memory writer](../../../architecture/memory/writer.md#publishing) describes how a batch
publishes in one transaction and how a crash at any point leaves it published once. The
[offline batch spike](../spikes/memory-batch/) tested this cursor under process kills.

## The gate for writer batches

The writer's writes pass the same [content gate](../../../architecture/memory/writes.md) as a
conversation write, with 2 differences. A batch write resolves the source record its candidate
selected, instead of searching the thread's latest messages, and a quote outside that batch becomes
a proposal. A job run has no messages from you, so every write from a job run is a proposal unless
your allow rule covers job runs.

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

## Consolidation

Consolidation comes after the first build. It runs weekly by default as a system task in its own
imp, with `memory.recall` and `memory.consolidate` as its only tools. It reads active items, never
the conversation, and proposes merges, rewrites and retirements as one diff, at most 30 changes. It
never forgets. Each change binds to the versions it read, and a merged item takes the least trusted
source among its inputs. You approve the whole diff or each change alone, and each approval is its
own record under [0006](../../../decisions/0006-approval-record.md).
