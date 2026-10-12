import { buildApprovalExtras } from './build-approval-extras';
import { buildApprovedProvenance } from './build-approved-provenance';
import type { ProposalAnswer } from './gate-types';
import { parseEvidence } from './parse-evidence';
import type { OpenedProposal } from './read-open-proposal';
import { readOpenProposal } from './read-open-proposal';
import { RetirementEditError } from './retirement-edit-error';
import type { StoreParts, VersionRef } from './types';
import { writeRememberedItem } from './write-remembered-item';
import { writeRetirement } from './write-retirement';

// Applies the operation a proposal binds to, with your approval, while the proposal is pending
// under the hash you saw. A moved-on item fails as stale and applies nothing. An edit approves your
// own text, which takes you as its origin and its source.
export async function writeProposalApproval(
  parts: StoreParts,
  answer: ProposalAnswer,
): Promise<VersionRef> {
  const opened = await readOpenProposal(parts, answer);
  const row = opened.row;

  if (row.operation === 'retire' && row.target_version !== null) {
    if (answer.editedText !== undefined) {
      throw new RetirementEditError(row.proposal_id);
    }
    return writeApprovedRetirement(parts, opened, answer);
  }
  return writeApprovedRemember(parts, opened, answer);
}

function writeApprovedRetirement(
  parts: StoreParts,
  opened: OpenedProposal,
  answer: ProposalAnswer,
): Promise<VersionRef> {
  const row = opened.row;
  const evidence = parseEvidence(row.evidence);

  return writeRetirement(
    parts,
    {
      target: { itemID: row.item_id, version: row.target_version ?? 0 },
      provenance: buildApprovedProvenance(row, false),
      ...(opened.text.quote === null ? {} : { intentQuote: opened.text.quote }),
      ...(evidence === null ? {} : { intentEvidence: evidence }),
    },
    buildApprovalExtras(parts, row, answer),
  );
}

// an approved proposal keeps its evidence; your edited text is its own source and cites none
function writeApprovedRemember(
  parts: StoreParts,
  opened: OpenedProposal,
  answer: ProposalAnswer,
): Promise<VersionRef> {
  const row = opened.row;
  const isEdited = answer.editedText !== undefined;
  const evidence = isEdited ? null : parseEvidence(row.evidence);
  const approvalExtras = buildApprovalExtras(parts, row, answer);
  const extras =
    row.target_version === null ? { ...approvalExtras, newItemID: row.item_id } : approvalExtras;

  return writeRememberedItem(
    parts,
    {
      text: answer.editedText ?? opened.text.text,
      provenance: buildApprovedProvenance(row, isEdited),
      ...(row.target_version === null
        ? {}
        : { target: { itemID: row.item_id, version: row.target_version } }),
      ...(evidence === null || opened.text.quote === null
        ? {}
        : { evidence, evidenceQuote: opened.text.quote }),
      ...(row.is_pinned === 1 ? { isPinned: true } : {}),
    },
    extras,
  );
}
