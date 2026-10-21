import { decodeProposalText } from './decode-proposal-text';
import type { MemoryProposalRow, ProposalAnswer } from './gate-types';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { readItemKey } from './read-item-key';
import { requirePendingProposal } from './require-pending-proposal';
import type { ProposalText } from './sealed-types';
import type { MemoryTables, StoreParts } from './types';

export interface OpenedProposal {
  readonly row: MemoryProposalRow;
  readonly text: ProposalText;
}

export async function readOpenProposal(
  parts: StoreParts,
  answer: Pick<ProposalAnswer, 'proposalID' | 'actionHash'>,
): Promise<OpenedProposal> {
  const row = await requirePendingProposal(
    parts.context.log.writer.db.$extendTables<MemoryTables>(),
    {
      proposalID: answer.proposalID,
      actionHash: answer.actionHash,
      now: parts.context.gate.clock.now(),
    },
  );

  const key = await readItemKey(parts.context.log, row.item_id);

  if (key === null || key === undefined) {
    throw new MemoryItemNotFoundError(row.item_id);
  }

  const text = await decodeProposalText(key, row.proposal_id, row.sealed);

  return { row, text };
}
