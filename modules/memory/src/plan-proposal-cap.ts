import { planBatchSplit } from './plan-batch-split';
import type { WriterBatch } from './read-writer-batch';
import type { GatedWrite } from './write-memory-batch';
import type { WriterConfig } from './writer-config-schema';
import type { BatchBounds } from './writer-types';

export type CappedBatch =
  | { readonly kind: 'split'; readonly bounds: BatchBounds }
  | { readonly kind: 'publish'; readonly writes: readonly GatedWrite[]; readonly dropped: number };

export function planProposalCap(
  config: Pick<WriterConfig, 'proposalCap'>,
  batch: WriterBatch,
  gated: readonly GatedWrite[],
): CappedBatch {
  const proposals = gated.filter((entry) => entry.verdict.outcome === 'propose');

  if (proposals.length <= config.proposalCap) {
    return { kind: 'publish', writes: gated, dropped: 0 };
  }

  const half = planBatchSplit(
    batch.bounds,
    batch.entries.map((entry) => ({ sequence: entry.sequence, isOwner: entry.role === 'owner' })),
  );

  if (half !== null) {
    return { kind: 'split', bounds: half };
  }

  const kept = new Set(proposals.slice(0, config.proposalCap));

  return {
    kind: 'publish',
    writes: gated.filter((entry) => entry.verdict.outcome === 'apply' || kept.has(entry)),
    dropped: proposals.length - kept.size,
  };
}
