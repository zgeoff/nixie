import invariant from 'tiny-invariant';
import type { MemoryProposals } from './gate-context';
import { readPendingProposals } from './read-pending-proposals';
import { readRejectedEdits } from './read-rejected-edits';
import { runProposalLapses } from './run-proposal-lapses';
import { runSharedProposalAnswer } from './run-shared-proposal-answer';
import type { StoreParts } from './types';

export function buildMemoryProposals(parts: StoreParts): MemoryProposals {
  return {
    listPending: (filter) => readPendingProposals(parts, filter),
    approve: async (answer) => {
      const result = await runSharedProposalAnswer(parts, { choice: 'approve', answer });

      invariant(result !== null, 'an approval that applies returns its result');

      return result;
    },
    reject: async (rejection) => {
      await runSharedProposalAnswer(parts, { choice: 'decline', answer: rejection });
    },
    lapse: () => runProposalLapses(parts),
    readRejectedEdits: (proposalIDs) => readRejectedEdits(parts, proposalIDs),
  };
}
