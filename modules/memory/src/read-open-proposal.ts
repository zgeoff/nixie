import { decodeProposalText } from './decode-proposal-text';
import { findItemKey } from './find-item-key';
import type { MemoryProposalRow, ProposalAnswer } from './gate-types';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { requirePendingProposal } from './require-pending-proposal';
import type { ProposalText } from './sealed-types';
import type { MemoryTables, StoreParts } from './types';

// A pending proposal that an answer may act on, with its sealed text opened.
export interface OpenedProposal {
  readonly row: MemoryProposalRow;
  readonly text: ProposalText;
}

// Reads the proposal an answer names, requires it pending under the hash the answer names, and
// opens its text under the item's key. A forgotten item has no key, so its proposal is gone.
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

  const key = await findItemKey(parts.context.log, row.item_id);

  if (key === null || key === undefined) {
    throw new MemoryItemNotFoundError(row.item_id);
  }

  const text = await decodeProposalText(key, row.proposal_id, row.sealed);

  return { row, text };
}
