import type { PendingSkillProposal, SkillAnswerContext } from '@heynixie/skills';
import { readPendingSkillProposals, writeSkillProposalAnswer } from '@heynixie/skills';
import invariant from 'tiny-invariant';
import { hostImplementer } from './host-implementer';

export function createHostSkillProposalProcedures(context: SkillAnswerContext) {
  const proposals = hostImplementer.skills.proposals;

  return {
    list: proposals.list.handler(async () => {
      const pending = await readPendingSkillProposals(context);

      return pending.map((entry) => buildPendingEntry(entry));
    }),

    approve: proposals.approve.handler(async (options) => {
      const input = options.input;

      const result = await writeSkillProposalAnswer(context, {
        answer: 'approve',
        proposalID: input.proposalID,
        skillHash: input.skillHash,
        ...(input.files === undefined ? {} : { files: input.files }),
      });

      invariant(result.approvalID !== null && result.skillHash !== null);

      return {
        proposalID: result.proposalID,
        approvalID: result.approvalID,
        skillHash: result.skillHash,
      };
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
    isStale: entry.isStale,
  };
}
