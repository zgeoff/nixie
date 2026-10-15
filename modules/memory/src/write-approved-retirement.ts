import { buildApprovalExtras } from './build-approval-extras';
import { buildApprovedProvenance } from './build-approved-provenance';
import type { ProposalAnswer } from './gate-types';
import { parseEvidence } from './parse-evidence';
import type { OpenedProposal } from './read-open-proposal';
import { RetirementEditError } from './retirement-edit-error';
import type { StoreParts, VersionRef } from './types';
import { writeRetirement } from './write-retirement';

// Applies an approved retirement proposal with its intent quote and evidence. A retirement adds no
// text, so an answer with edited text is refused.
export function writeApprovedRetirement(
  parts: StoreParts,
  opened: OpenedProposal,
  answer: ProposalAnswer,
): Promise<VersionRef> {
  const row = opened.row;

  if (answer.editedText !== undefined) {
    return Promise.reject(new RetirementEditError(row.proposal_id));
  }

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
