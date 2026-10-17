import type { MemoryProposal } from '@heynixie/memory';
import { hostImplementer } from './host-implementer';
import { requireHostMemory } from './require-host-memory';
import type { ReadHostMemory } from './types';

// Builds the host procedures over the pending memory proposals: list them, and approve or reject
// one under the action hash memory-pending showed.
export function buildHostProposalProcedures(readMemory: ReadHostMemory) {
  const proposals = hostImplementer.memory.proposals;

  return {
    list: proposals.list.handler(async (options) => {
      const memory = requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const pending = await memory.listProposals();

      return pending.map((proposal) => buildPendingEntry(proposal));
    }),

    approve: proposals.approve.handler((options) => {
      const memory = requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED);
      const answer = options.input;

      return memory.approveProposal({
        proposalID: answer.proposalID,
        actionHash: answer.actionHash,
        ...(answer.revisionOf === undefined ? {} : { revisionOf: answer.revisionOf }),
        ...(answer.ignoreCloseMatch === undefined
          ? {}
          : { ignoreCloseMatch: answer.ignoreCloseMatch }),
        ...(answer.editedText === undefined ? {} : { editedText: answer.editedText }),
      });
    }),

    reject: proposals.reject.handler(async (options) => {
      const memory = requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      await memory.rejectProposal({
        proposalID: options.input.proposalID,
        actionHash: options.input.actionHash,
        ...(options.input.reason === undefined ? {} : { reason: options.input.reason }),
      });

      return { proposalID: options.input.proposalID };
    }),
  };
}

// What a host command shows of a pending proposal: its text, every source that proposed it, and
// the hash an answer binds to.
function buildPendingEntry(proposal: MemoryProposal) {
  return {
    proposalID: proposal.proposalID,
    operation: proposal.operation,
    itemID: proposal.itemID,
    targetVersion: proposal.targetVersion,
    isPinned: proposal.isPinned,
    kind: proposal.kind,
    reason: proposal.reason,
    actionHash: proposal.actionHash,
    origin: proposal.origin,
    source: proposal.source,
    createdAt: new Date(proposal.createdAt),
    lapseAt: new Date(proposal.lapseAt),
    sources: proposal.sources.map((source) => ({
      origin: source.origin,
      thread: source.thread,
      proposedAt: new Date(source.proposedAt),
    })),
    text: proposal.text,
    quote: proposal.quote,
  };
}
