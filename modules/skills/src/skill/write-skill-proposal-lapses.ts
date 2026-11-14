import { writeProposalLapses } from '@heynixie/proposals';
import type { SkillProposalContext } from '../types';
import { skillsWriteLapsedCodec } from '../write/skills-write-lapsed-codec';
import { readSkillProposals } from './read-skill-proposals';

export function writeSkillProposalLapses(context: SkillProposalContext): Promise<number> {
  return writeProposalLapses(context, {
    readProposals: async (db) => {
      const proposals = await readSkillProposals(db);

      return proposals.map((entry) => ({
        proposalID: entry.proposal.proposalID,
        thread: entry.thread,
        proposedAt: entry.proposedAt,
        outcome: entry.outcome,
      }));
    },
    lapsedCodec: skillsWriteLapsedCodec,
  });
}
