import type { PendingPromptProposal, PromptAnswerContext } from '@heynixie/prompts';
import { readPendingPromptProposals, writePromptProposalAnswer } from '@heynixie/prompts';
import invariant from 'tiny-invariant';
import { hostImplementer } from './host-implementer';

export interface HostPromptContext extends PromptAnswerContext {
  readonly wakeExports: () => void;
}

export function createHostPromptProposalProcedures(context: HostPromptContext) {
  const proposals = hostImplementer.prompts.proposals;

  return {
    list: proposals.list.handler(async () => {
      const pending = await readPendingPromptProposals(context);

      return pending.map((entry) => buildPendingEntry(entry));
    }),

    approve: proposals.approve.handler(async (options) => {
      const input = options.input;

      const result = await writePromptProposalAnswer(context, {
        answer: 'approve',
        proposalID: input.proposalID,
        proposalHash: input.proposalHash,
        ...(input.entry === undefined ? {} : { entry: input.entry }),
        ...(input.files === undefined ? {} : { files: input.files }),
      });

      invariant(result.approvalID !== null && result.proposalHash !== null);

      context.wakeExports();

      return {
        proposalID: result.proposalID,
        approvalID: result.approvalID,
        proposalHash: result.proposalHash,
      };
    }),

    reject: proposals.reject.handler(async (options) => {
      await writePromptProposalAnswer(context, { answer: 'reject', ...options.input });

      return { proposalID: options.input.proposalID };
    }),
  };
}

function buildPendingEntry(entry: PendingPromptProposal) {
  const proposal = entry.proposal;

  return {
    proposalID: proposal.proposalID,
    promptID: proposal.promptID,
    proposalHash: proposal.proposalHash,
    baseHash: proposal.baseHash,
    entry: { ...proposal.entry },
    files: proposal.files.map((file) => ({ path: file.path, text: file.text })),
    reason: proposal.reason,
    inForce:
      entry.inForce === null
        ? null
        : { parts: { ...entry.inForce.parts }, template: entry.inForce.template },
    thread: entry.thread,
    provenance: proposal.provenance,
    createdAt: new Date(entry.proposedAt),
    lapseAt: new Date(entry.lapseAt),
    isStale: entry.isStale,
  };
}
