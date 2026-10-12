import type { MemoryProposalRow, ProposalAnswer } from './gate-types';
import { requirePendingProposal } from './require-pending-proposal';
import type { StoreParts } from './types';
import type { VersionExtras } from './write-memory-version';

// What an approved version adds inside its transaction: the proposal must still be pending under
// the hash you saw, and the approval record commits with the version and consumes the proposal.
export function buildApprovalExtras(
  parts: StoreParts,
  row: MemoryProposalRow,
  answer: ProposalAnswer,
): VersionExtras {
  const approvalID = crypto.randomUUID();
  const approval = { proposalID: row.proposal_id, approvalID, actionHash: row.action_hash };

  return {
    requireInTransaction: async (db) => {
      await requirePendingProposal(db, {
        proposalID: answer.proposalID,
        actionHash: answer.actionHash,
        now: parts.context.gate.clock.now(),
      });
    },
    approval: {
      envelope: approval,
      record: {
        kind: 'memory.approval_recorded',
        definitions: parts.context.definitions(),
        ...(row.thread === null ? {} : { thread: row.thread }),
        approval,
        payload: {
          ...approval,
          answer: answer.editedText === undefined ? 'approved' : 'edited',
          identityID: answer.identityID,
        },
      },
    },
  };
}
