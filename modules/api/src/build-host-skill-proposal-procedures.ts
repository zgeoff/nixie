import type { PendingSkillProposal, SkillProposalContext } from '@heynixie/skills';
import { readPendingSkillProposals, writeSkillProposalAnswer } from '@heynixie/skills';
import { hostImplementer } from './host-implementer';

// Builds the host procedures over the pending skill proposals: list them with the version of each
// skill in force, and approve or reject one under the skill hash skill-pending showed.
export function buildHostSkillProposalProcedures(context: SkillProposalContext) {
  const proposals = hostImplementer.skills.proposals;

  return {
    list: proposals.list.handler(async () => {
      const pending = await readPendingSkillProposals(context);

      return pending.map((entry) => buildPendingEntry(entry));
    }),

    approve: proposals.approve.handler(async (options) => {
      await writeSkillProposalAnswer(context, { answer: 'approve', ...options.input });

      return { proposalID: options.input.proposalID };
    }),

    reject: proposals.reject.handler(async (options) => {
      await writeSkillProposalAnswer(context, { answer: 'reject', ...options.input });

      return { proposalID: options.input.proposalID };
    }),
  };
}

function buildPendingEntry(entry: PendingSkillProposal) {
  const proposal = entry.proposal;

  return {
    proposalID: proposal.proposalID,
    name: proposal.name,
    skillHash: proposal.skillHash,
    baseHash: proposal.baseHash,
    files: proposal.files.map((file) => ({ path: file.path, text: file.text })),
    inForce:
      entry.inForce === null
        ? null
        : {
            skillHash: entry.inForce.skillHash,
            origin: entry.inForce.origin,
            files: entry.inForce.files.map((file) => ({ path: file.path, text: file.text })),
          },
    untypedToken: proposal.untypedToken,
    thread: entry.thread,
    provenance: proposal.provenance,
    createdAt: new Date(entry.proposedAt),
    lapseAt: new Date(entry.lapseAt),
  };
}
