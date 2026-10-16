import { buildMemoryConsolidations } from './build-memory-consolidations';
import { buildMemoryProposals } from './build-memory-proposals';
import { buildMemoryWrites } from './build-memory-writes';
import type { MemoryConsolidations } from './consolidation-types';
import type { MemoryNotice, MemoryProposals, MemoryWrites, ReviewReason } from './gate-types';
import { readMemoryNotices } from './read-memory-notices';
import { renderReviewReason } from './render-review-reason';
import type { StoreParts } from './types';

export interface MemoryGate {
  // the gated write paths of the model and the memory writer
  readonly writes: MemoryWrites;
  readonly proposals: MemoryProposals;

  // the consolidator's diffs and your answers to their changes
  readonly consolidations: MemoryConsolidations;
  readonly readNotices: (thread: string) => Promise<readonly MemoryNotice[]>;

  // the sentence a review reason reads as, with your name, your pronouns and the gate's window
  readonly renderReviewReason: (reason: ReviewReason) => string;
}

// The gated write paths over the store's parts, with the proposals they make, the consolidator's
// diffs and the notices.
export function buildMemoryGate(parts: StoreParts): MemoryGate {
  return {
    writes: buildMemoryWrites(parts),
    proposals: buildMemoryProposals(parts),
    consolidations: buildMemoryConsolidations(parts),
    readNotices: (thread) => readMemoryNotices(parts, thread),
    renderReviewReason: (reason) => renderReviewReason(reason, parts.context.gate),
  };
}
