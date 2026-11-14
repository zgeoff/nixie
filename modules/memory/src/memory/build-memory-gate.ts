import type {
  MemoryNotice,
  MemoryProposals,
  MemoryWrites,
  ReviewReason,
} from '../gate/gate-context';
import { renderReviewReason } from '../gate/render-review-reason';
import type { StoreParts } from '../types';
import type { MemoryConsolidations } from '../utils/memory-consolidations';
import { buildMemoryConsolidations } from './build-memory-consolidations';
import { buildMemoryProposals } from './build-memory-proposals';
import { buildMemoryWrites } from './build-memory-writes';
import { readMemoryNotices } from './read-memory-notices';

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
