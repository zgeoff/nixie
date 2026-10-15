import type { ApprovalResult, ProposalAnswer } from './gate-types';
import { readOpenProposal } from './read-open-proposal';
import { RevisionTargetError } from './revision-target-error';
import { toAppliedResult } from './to-applied-result';
import type { StoreParts } from './types';
import { writeApprovedNewItem } from './write-approved-new-item';
import { writeApprovedRemember } from './write-approved-remember';
import { writeApprovedRetirement } from './write-approved-retirement';

// Applies the operation a proposal binds to, with your approval, while the proposal is pending
// under the hash you saw. A moved-on item fails as stale and applies nothing. An edit approves your
// own text, which takes you as its origin and its source.
export async function writeProposalApproval(
  parts: StoreParts,
  answer: ProposalAnswer,
): Promise<ApprovalResult> {
  const opened = await readOpenProposal(parts, answer);

  const row = opened.row;

  if (row.target_version === null) {
    return writeApprovedNewItem(parts, opened, answer);
  }

  if (answer.revisionOf !== undefined) {
    throw new RevisionTargetError(row.proposal_id);
  }

  const target = { itemID: row.item_id, version: row.target_version };

  const ref =
    row.operation === 'retire'
      ? await writeApprovedRetirement(parts, opened, answer)
      : await writeApprovedRemember(parts, { opened, answer, target });

  return toAppliedResult(ref);
}
