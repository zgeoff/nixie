import type { ProposalAnswer } from '../gate/gate-context';
import { PinEditError } from '../pin/pin-edit-error';
import { writePin } from '../pin/write-pin';
import type { OpenedProposal } from '../proposal/read-open-proposal';
import type { StoreParts, VersionRef } from '../types';
import { buildApprovalExtras } from './build-approval-extras';
import { buildApprovedProvenance } from './build-approved-provenance';

export async function writeApprovedPin(
  parts: StoreParts,
  opened: OpenedProposal,
  answer: ProposalAnswer,
): Promise<VersionRef> {
  const row = opened.row;

  if (answer.editedText !== undefined) {
    throw new PinEditError(row.proposal_id);
  }

  const target = { itemID: row.item_id, version: row.target_version ?? 0 };
  const extras = buildApprovalExtras(parts, row, answer);

  await writePin(
    parts,
    {
      itemID: target.itemID,
      isPinned: true,
      version: target.version,
      provenance: buildApprovedProvenance(row, false),
      ...(extras.writeInTransaction === undefined
        ? {}
        : { writeInTransaction: extras.writeInTransaction }),
    },
    extras,
  );

  return target;
}
