import type { ProposalAnswer } from '../gate/gate-context';
import type { OpenedProposal } from '../proposal/read-open-proposal';
import { RetirementEditError } from '../retirement/retirement-edit-error';
import { writeRetirement } from '../retirement/write-retirement';
import type { StoreParts, VersionRef } from '../types';
import { parseEvidence } from '../utils/parse-evidence';
import { buildApprovalExtras } from './build-approval-extras';
import { buildApprovedProvenance } from './build-approved-provenance';

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
