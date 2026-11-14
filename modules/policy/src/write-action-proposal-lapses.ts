import type { ProposalContext } from '@heynixie/proposals';
import { writeProposalLapses } from '@heynixie/proposals';
import { actionLapsedCodec } from './action-lapsed-codec';
import { actionProposalLapseMs } from './action-proposal-lapse-ms';
import { readActionProposals } from './read-action-proposals';

export function writeActionProposalLapses(context: ProposalContext): Promise<number> {
  return writeProposalLapses(context, {
    lapseMs: actionProposalLapseMs,
    readProposals: async (db) => {
      const proposals = await readActionProposals(db);

      return proposals.map((entry) => ({
        proposalID: entry.proposalID,
        thread: entry.thread,
        proposedAt: entry.proposedAt,
        outcome: toProposalOutcome(entry.outcome),
      }));
    },
    lapsedCodec: actionLapsedCodec,
  });
}

function toProposalOutcome(
  outcome: 'approved' | 'declined' | 'lapsed' | null,
): 'approved' | 'rejected' | 'lapsed' | null {
  return outcome === 'declined' ? 'rejected' : outcome;
}
