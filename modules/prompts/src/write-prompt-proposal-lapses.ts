import type { ProposalContext } from '@heynixie/proposals';
import { writeProposalLapses } from '@heynixie/proposals';
import { promptsOverrideLapsedCodec } from './prompts-override-lapsed-codec';
import { readPromptProposals } from './read-prompt-proposals';

export function writePromptProposalLapses(context: ProposalContext): Promise<number> {
  return writeProposalLapses(context, {
    readProposals: async (db) => {
      const proposals = await readPromptProposals(db);

      return proposals.map((entry) => ({
        proposalID: entry.proposal.proposalID,
        thread: entry.thread,
        proposedAt: entry.proposedAt,
        outcome: entry.outcome,
      }));
    },
    lapsedCodec: promptsOverrideLapsedCodec,
  });
}
