# 0031: Memory capture, context and removal

- Date: 2026-10-09
- Status: decided
- Amends: [0011](./0011-memory-writes.md), [0024](./0024-memory-in-context.md)
- Design: [the store](../design/memory/store.md), [writes](../design/memory/writes.md),
  [context](../design/memory/context.md)

The owner agreed the memory choices below. Memory remains canonical rows with version history and
host-set provenance under [0010](./0010-memory-store.md). SDK sessions provide working context;
their summaries do not become durable facts.

## Local semantic retrieval

The first build includes local embeddings and retains keyword lookup. Per-turn retrieval and recall
share a service over readable active memory items and eligible past owner messages and model
replies. The host encoder uses pinned local assets, without an inference API call. The encoder and
ranking implementation remain validation and tuning choices; no candidate model from the synthetic
spike is adopted.

Derived indexes stay in memory. Queries use one encoder/index generation, and returned text comes
from current canonical rows. Retire and forget invalidate derived entries and pending results.
Keyword-only fallback during a rebuild is recorded. This replaces 0024's keyword-first inclusion
rule; its SDK session, compaction and summary boundaries remain.

## Conversation writes and batched capture

The conversation and tasks write during chat, including explicit requests. A background writer
captures passing facts from bounded batches of committed conversation turns. Count, idle and
maximum-age triggers prevent capture from waiting indefinitely for compaction. Both paths use the
same checks for the operation they perform.

The writer reads original messages in order, with source-bound evidence; a summary is not evidence.
Its writes stage before publication, and the host commits writes or review proposals, notices,
receipts and the batch cursor together. Retries can repeat extraction, but not the committed batch
effects. SDK compaction remains; nixie does not introduce custom session rollover.

## Transcript lifecycle

The SDK transcript stays as a live working cache on its task's imp. It leaves backups and export
out. The event log owns readable application history, canonical task state and outside-action
outcomes. A lost or invalid transcript starts a fresh session from the task brief, recent turns, an
eligible summary and canonical recovery state.

A rebuild does not promise identical SDK-internal context or cache continuity. Older owner messages
and stored items remain available through recall; older tool output is outside indexed recall.
Invalid cache branches are blocked, their writers stopped and their task-reserved SDK state
directory removed before rebuild. Pending cleanup survives a restart.

## Reversible chat removal and checked destruction

"Forget that" in chat retires the bound item/version, with undo. Its intent quote must come from
typed owner text outside quoted blocks. The checker tests the request against the exact item, with
stored text labelled as untrusted data. Ambiguity or a failed check becomes a review proposal.

Retirement carries no replacement text, so it does not require the owner to repeat the old fact's
destination tokens. It preserves content source and evidence, and records the operation actor and
intent separately. This narrows 0011's content-introducing checks for retirement only. Model
restore, undo and permanent deletion are not added.

Only a checked client action destroys a memory item. The retired-memory view supports bulk permanent
deletion after a preview and confirmation bound to a fixed item/version set. Changed or restored
targets make the preview stale; later retirements do not join it. Deletion records durable per-item
progress and cannot undo a key that it already destroyed. Independent owner messages and replies
remain separate records.

0010's backup-erasure guarantee remains. Forget completion includes removing recoverable key copies,
index entries and invalid local session copies, rather than waiting for the next scheduled backup
after reporting success. Provider-held context that already received the text remains outside that
local deletion boundary.

## Compact notices with undo

Writes that apply at once appear as one compact group per turn or batch, with expandable facts and
per-item undo. Later batches add quiet notices in their thread, with no push. Successful writes do
not duplicate into the digest; review proposals stay there.

## Alternatives and trade-offs

- Keyword-only retrieval misses paraphrases in the synthetic sample. Local embeddings add an encoder
  and an index; the gain on owner questions remains unmeasured.
- A per-turn writer captures facts sooner and makes more calls. Batching delays passing facts while
  explicit conversation writes remain immediate.
- Custom rollover gives nixie more summary control and adds continuity and recovery work. SDK
  compaction retains the established session path, with its recovery edges still to test.
- Transcript backups can preserve more exact working context after disk loss and add a second forget
  path. The live-cache choice accepts a bounded reconstruction after loss.
- Chat destruction saves a checked action and makes a wrong target irreversible. Retirement
  preserves undo; bulk checked deletion reduces the work to clear retired items.
- Digest-only notices reduce conversation clutter and delay discovery of wrong writes. A compact
  inline group keeps visibility without a separate line per fact.

## Validation still open

The [retrieval spike](../../spikes/memory-retrieval/) uses synthetic memory. The
[offline batch spike](../../spikes/memory-batch/) checks SQLite checkpoints with fixture model
output, not extraction quality or real SDK continuity. The
[pinned-core run](../../spikes/sdk-pinned-core/) completed no turn because of quota. Owner-history
retrieval, writer/checker quality, encoder choice, cache costs, compaction recovery, bulk-deletion
races and backend-specific backup erasure remain validation work under
[open items](../design/open-items.md#spikes-to-run).
