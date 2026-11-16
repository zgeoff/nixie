import type { MemoryProposalRow, ProposalAnswer } from '../gate/gate-context';
import { readItemKeys } from '../item-key/read-item-keys';
import { proposalLabelsCodec } from '../label/proposal-labels-codec';
import { requirePendingProposal } from '../pending/require-pending-proposal';
import type { Labels, MemoryTables, StoreParts } from '../types';
import type { ProposalText } from '../utils/codec/sealed-codec';
import { decodeProposalText } from '../utils/decode-proposal-text';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';

export interface OpenedProposal {
  readonly row: MemoryProposalRow;
  readonly text: ProposalText;

  // null for a proposal with no proposal label record
  readonly labels: Labels | null;
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

  const [opened] = await readItemKeys(parts.context.log, [
    { value: 'proposal', itemID: row.item_id, sequence: row.created_sequence },
  ]);

  if (opened?.status !== 'readable') {
    throw new MemoryItemNotFoundError(row.item_id);
  }

  const key = opened.key;

  const text = await decodeProposalText(key, row.proposal_id, row.sealed);

  const labels =
    row.sealed_labels === null
      ? null
      : await proposalLabelsCodec.decode(key, row.proposal_id, row.sealed_labels);

  return { row, text, labels };
}
