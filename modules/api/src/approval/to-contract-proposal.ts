import type { ViewProposal } from '@heynixie/memory';
import { toContractImage } from '../utils/to-contract-image';
import { toContractKind } from '../utils/to-contract-kind';

export function toContractProposal(proposal: ViewProposal) {
  const evidence = proposal.evidence;

  return {
    proposalID: proposal.proposalID,
    operation: proposal.operation,
    itemID: proposal.itemID,
    targetVersion: proposal.targetVersion,
    isPinned: proposal.isPinned,
    isSensitive: proposal.isSensitive,
    kind: toContractKind(proposal.subject),
    labels:
      proposal.labels === null
        ? null
        : {
            gist: proposal.labels.gist,
            topic: proposal.labels.topic,
            triggers: [...proposal.labels.triggers],
            isLabelOnly: proposal.labels.isLabelOnly,
          },
    subject: proposal.subject,
    newSubject: proposal.newSubject,
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
    until: proposal.until === null ? null : new Date(proposal.until),
    evidence:
      evidence === null
        ? null
        : {
            sequence: evidence.recordSequence,
            start: evidence.start,
            end: evidence.end,
            message: evidence.message,
          },

    image: toContractImage(proposal.image),
  };
}
