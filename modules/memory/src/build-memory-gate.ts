import { buildMemoryConsolidations } from './build-memory-consolidations';
import { buildMemoryProposals } from './build-memory-proposals';
import { buildMemoryWrites } from './build-memory-writes';
import type { MemoryConsolidations } from './consolidation-types';
import type { MemoryNotice, MemoryProposals, MemoryWrites, ReviewReason } from './gate-types';
import { readMemoryNotices } from './read-memory-notices';
import { renderReviewReason } from './render-review-reason';
import type { StoreParts } from './types';

export interface MemoryGate {
  readonly writes: MemoryWrites;
  readonly proposals: MemoryProposals;

  readonly consolidations: MemoryConsolidations;
  readonly readNotices: (thread: string) => Promise<readonly MemoryNotice[]>;

  readonly renderReviewReason: (reason: ReviewReason) => string;
}

export function buildMemoryGate(parts: StoreParts): MemoryGate {
  return {
    writes: buildMemoryWrites(parts),
    proposals: buildMemoryProposals(parts),
    consolidations: buildMemoryConsolidations(parts),
    readNotices: (thread) => readMemoryNotices(parts, thread),
    renderReviewReason: (reason) => renderReviewReason(reason, parts.context.gate),
  };
}
