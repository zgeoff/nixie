# 0031: Memory capture, context and removal

- Date: 2026-10-09
- Status: decided
- Design: [memory store](../design/memory/store.md), [memory writes](../design/memory/writes.md),
  [memory context](../design/memory/context.md)
- Research: [batch spike](../../spikes/memory-batch/)

nixie's memory settles these choices. Retrieval is set by [0024](./0024-memory-in-context.md), and
the store by [0010](./0010-memory-store.md).

## Conversation writes and batched capture

The conversation and tasks write memory during chat, including explicit requests. A background
writer captures facts mentioned in passing from bounded batches of committed turns, triggered by a
message count, idle time or a maximum age. Both paths use the checks from
[0011](./0011-memory-writes.md).

The writer reads the original messages in order, and a summary is never evidence. The writer stages
its writes, and the host commits the writes or proposals, their notices and the batch cursor in one
transaction, so a retry can repeat extraction but never the committed effects. SDK compaction stays,
with no custom session rollover.

## The SDK transcript as a cache

The SDK transcript is a working cache on its task's imp, and backups and export leave it out. The
event log owns history, task state and action outcomes. A lost or invalid transcript starts a fresh
session from the task brief, recent turns, an eligible summary and the task's recorded state. A
rebuild keeps history but not identical SDK context: older messages and stored items stay reachable
through recall, and older tool output does not.

## Reversible chat removal and checked destruction

"Forget that" in chat retires the item it names, with undo, under the intent check in 0011.
Ambiguity or a failed check becomes a proposal. The model can retire an item, and cannot restore,
undo or destroy one. Only a checked action in the client destroys a memory item, and the
retired-memory view deletes in bulk after a preview bound to a fixed set of items and versions. A
changed or restored item makes the preview stale, and a later retirement does not join it. A
destroyed key cannot be restored. Your original messages and nixie's replies stay separate records.

## Grouped notices with undo

Writes that apply at once show as one group per turn or batch, such as "Remembered 3 things · View",
with each fact expandable and its own undo. A later batch adds a quiet notice in its thread, with no
push. Successful writes never enter the approval digest, and proposals do.

## The first build

The first build uses the smallest mechanism that keeps each guarantee, as the memory store design
sets out: a full index rebuild, a rebuild of every live session and deletion of every stored summary
on a permanent forget, and one lock across key-backup publication and forget. Exposure tracking,
index generations and concurrent key publication extend it later with no change of contract.

## Why

- Batching makes fewer model calls than a writer on every turn, and explicit requests stay
  immediate.
- One authoritative history is simpler than two, and a second transcript copy would need its own
  forget path.
- Retiring by default turns a misread "forget that" into an undo, not a loss.
- One compact notice per batch keeps writes visible without a line for every fact.
- A blunt first build keeps every guarantee true while forgets are rare.

## Alternatives

- **A writer on every turn.** It captures facts sooner and makes more calls.
- **Custom session rollover.** It gives more control over summaries, and adds continuity and crash
  recovery work.
- **Transcript backups.** They keep more exact context after disk loss, and add a second forget
  path.
- **Destruction from chat.** It saves a checked action, and makes a wrong target irreversible.
- **Notices in the approval digest only.** They keep the conversation clear, and delay finding a
  wrong write.
