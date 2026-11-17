import type { ProposalAnswer } from '../gate/gate-context';
import { LabelEditError } from '../label/label-edit-error';
import { writeLabelEdit } from '../label/write-label-edit';
import type { OpenedProposal } from '../proposal/read-open-proposal';
import type { StoreParts, VersionRef } from '../types';
import { buildApprovalExtras } from './build-approval-extras';
import { buildApprovedProvenance } from './build-approved-provenance';
import { readApprovalTarget } from './read-approval-target';

// The approval of a label-only proposal writes the reviewed labels and no text version.
export async function writeApprovedLabels(
  parts: StoreParts,
  opened: OpenedProposal,
  answer: ProposalAnswer,
): Promise<VersionRef> {
  const row = opened.row;
  const labels = opened.labels;

  if (answer.editedText !== undefined || labels === null) {
    throw new LabelEditError(row.proposal_id);
  }

  const target = await readApprovalTarget(parts, row);

  return writeLabelEdit(
    parts,
    { target, labels, provenance: buildApprovedProvenance(row, false) },
    buildApprovalExtras(parts, row, answer),
  );
}
