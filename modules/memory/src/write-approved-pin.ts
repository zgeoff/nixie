import { buildApprovalExtras } from './build-approval-extras';
import { buildApprovedProvenance } from './build-approved-provenance';
import type { ProposalAnswer } from './gate-types';
import { PinEditError } from './pin-edit-error';
import type { OpenedProposal } from './read-open-proposal';
import type { StoreParts, VersionRef } from './types';
import { writePin } from './write-pin';

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
