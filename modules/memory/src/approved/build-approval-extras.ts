import type { MemoryProposalRow, ProposalAnswer } from '../gate/gate-context';
import type { VersionExtras } from '../memory/write-memory-version';
import { requirePendingProposal } from '../pending/require-pending-proposal';
import type { StoreParts } from '../types';

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
    ...(answer.writeInTransaction === undefined
      ? {}
      : { writeInTransaction: answer.writeInTransaction }),
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
