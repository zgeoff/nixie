import type { MemoryNotice, MemoryProposals, MemoryWrites } from './gate-types';
import { readMemoryNotices } from './read-memory-notices';
import { readPendingProposals } from './read-pending-proposals';
import { runProposalLapses } from './run-proposal-lapses';
import type { StoreParts } from './types';
import { writeGatedRemember } from './write-gated-remember';
import { writeGatedRetirement } from './write-gated-retirement';
import { writeProposalApproval } from './write-proposal-approval';
import { writeProposalRejection } from './write-proposal-rejection';

export interface MemoryGate {
  // the gated write paths of the model and the memory writer
  readonly writes: MemoryWrites;
  readonly proposals: MemoryProposals;
  readonly readNotices: (thread: string) => Promise<readonly MemoryNotice[]>;
}

// The gated write paths over the store's parts, with the proposals they make and the notices.
export function buildMemoryGate(parts: StoreParts): MemoryGate {
  return {
    writes: {
      remember: (request) => writeGatedRemember(parts, request),
      retire: (request) => writeGatedRetirement(parts, request),
    },
    proposals: {
      listPending: () => readPendingProposals(parts),
      approve: (answer) => writeProposalApproval(parts, answer),
      reject: (answer) => writeProposalRejection(parts, answer),
      lapse: () => runProposalLapses(parts),
    },
    readNotices: (thread) => readMemoryNotices(parts, thread),
  };
}
