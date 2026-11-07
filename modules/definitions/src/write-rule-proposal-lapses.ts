import type { ProposalContext } from '@heynixie/proposals';
import { writeProposalLapses } from '@heynixie/proposals';
import { readRuleProposals } from './read-rule-proposals';
import { rulesChangeLapsedCodec } from './rules-change-lapsed-codec';

export function writeRuleProposalLapses(context: ProposalContext): Promise<number> {
  return writeProposalLapses(context, {
    readProposals: async (db) => {
      const proposals = await readRuleProposals(db);

      return proposals.flatMap((entry) =>
        entry.outcome === 'withdrawn'
          ? []
          : [
              {
                proposalID: entry.proposal.proposalID,
                thread: null,
                proposedAt: entry.proposedAt,
                outcome: entry.outcome,
              },
            ],
      );
    },
    lapsedCodec: rulesChangeLapsedCodec,
  });
}
