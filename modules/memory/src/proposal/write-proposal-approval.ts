import { waitAtFaultPoint } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import { writeApprovedNewItem } from '../approved/write-approved-new-item';
import { writeApprovedPin } from '../approved/write-approved-pin';
import { writeApprovedRemember } from '../approved/write-approved-remember';
import { writeApprovedRetirement } from '../approved/write-approved-retirement';
import type { ApprovalResult, ProposalAnswer } from '../gate/gate-context';
import type { StoreParts } from '../types';
import { readOpenProposal } from './read-open-proposal';
import { RevisionTargetError } from './revision-target-error';
import { toAppliedResult } from './to-applied-result';

export async function writeProposalApproval(
  parts: StoreParts,
  answer: ProposalAnswer,
): Promise<ApprovalResult> {
  const opened = await readOpenProposal(parts, answer);

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('memory.approval.opened', { kind: 'memory', id: answer.proposalID });
  }

  const row = opened.row;

  if (row.target_version === null) {
    return writeApprovedNewItem(parts, opened, answer);
  }

  if (answer.revisionOf !== undefined) {
    throw new RevisionTargetError(row.proposal_id);
  }

  const target = { itemID: row.item_id, version: row.target_version };

  const ref = await match(row.operation)
    .with('retire', () => writeApprovedRetirement(parts, opened, answer))
    .with('pin', () => writeApprovedPin(parts, opened, answer))
    .with('remember', () => writeApprovedRemember(parts, { opened, answer, target }))
    .exhaustive();

  return toAppliedResult(ref);
}
