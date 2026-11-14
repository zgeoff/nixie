import { buildShortIDFromUUID } from '@heynixie/db';
import type { EnvelopeRecord } from '@heynixie/log';
import type { ProposalChange } from '@heynixie/proposals';
import { parseProposalRecord } from './parse-proposal-record';

export function mapMemoryProposalRecord(record: EnvelopeRecord): ProposalChange | null {
  const parsed = parseProposalRecord(record);

  if (parsed === null) {
    return null;
  }

  if (parsed.kind === 'memory.proposed') {
    return {
      type: 'create',
      proposal: {
        id: parsed.proposalID,
        shortID: buildShortIDFromUUID(parsed.proposalID),
        family: 'memory',
        kind: 'memory_write',
        riskClass: 'routine',
        actionHash: parsed.actionHash,
        ruleHash: null,
        cause: parsed.reviewReason,
        taskID: parsed.taskID,
        lapsesAt: parsed.lapseAt,
        deadlineAt: null,
      },
    };
  }

  if (parsed.kind === 'memory.proposal_merged') {
    return { type: 'extend', proposalID: parsed.proposalID, lapsesAt: parsed.lapseAt };
  }

  if (parsed.kind === 'memory.approval_recorded') {
    return {
      type: 'close',
      proposalID: parsed.proposalID,
      state: 'approved',
      usedBy: parsed.approvalID,
    };
  }

  return {
    type: 'close',
    proposalID: parsed.proposalID,
    state: parsed.kind === 'memory.proposal_rejected' ? 'declined' : 'lapsed',
    usedBy: null,
  };
}
