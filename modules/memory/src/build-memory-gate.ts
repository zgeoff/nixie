import { buildMemoryConsolidations } from './build-memory-consolidations';
import { buildMemoryProposals } from './build-memory-proposals';
import { buildWriterGate } from './build-writer-gate';
import type { MemoryConsolidations } from './consolidation-types';
import type { MemoryNotice, MemoryProposals, MemoryWrites } from './gate-types';
import { readMemoryNotices } from './read-memory-notices';
import type { StoreParts } from './types';
import { writeGatedRemember } from './write-gated-remember';
import { writeGatedRetirement } from './write-gated-retirement';

export interface MemoryGate {
  // the gated write paths of the model and the memory writer
  readonly writes: MemoryWrites;
  readonly proposals: MemoryProposals;

  // the consolidator's diffs and your answers to their changes
  readonly consolidations: MemoryConsolidations;
  readonly readNotices: (thread: string) => Promise<readonly MemoryNotice[]>;
}

// The gated write paths over the store's parts, with the proposals they make, the consolidator's
// diffs and the notices.
export function buildMemoryGate(parts: StoreParts): MemoryGate {
  return {
    writes: {
      remember: (request) => writeGatedRemember(parts, request),
      retire: (request) => writeGatedRetirement(parts, request),
      batch: buildWriterGate(parts),
    },
    proposals: buildMemoryProposals(parts),
    consolidations: buildMemoryConsolidations(parts),
    readNotices: (thread) => readMemoryNotices(parts, thread),
  };
}
