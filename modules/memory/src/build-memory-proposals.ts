import type { MemoryProposals } from './gate-types';
import { readPendingProposals } from './read-pending-proposals';
import { readRejectedEdits } from './read-rejected-edits';
import { runProposalLapses } from './run-proposal-lapses';
import type { StoreParts } from './types';
import { writeProposalApproval } from './write-proposal-approval';
import { writeProposalRejection } from './write-proposal-rejection';

export function buildMemoryProposals(parts: StoreParts): MemoryProposals {
  return {
    listPending: (filter) => readPendingProposals(parts, filter),
    approve: (answer) => writeProposalApproval(parts, answer),
    reject: (rejection) => writeProposalRejection(parts, rejection),
    lapse: () => runProposalLapses(parts),
    readRejectedEdits: (proposalIDs) => readRejectedEdits(parts, proposalIDs),
  };
}
