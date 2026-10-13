import { removeRecordKey } from '@heynixie/log';
import { findCloseMatch } from './find-close-match';
import type { ApprovalResult, ProposalAnswer } from './gate-types';
import type { OpenedProposal } from './read-open-proposal';
import { toAppliedResult } from './to-applied-result';
import type { StoreParts } from './types';
import { writeApprovedRemember } from './write-approved-remember';

// Applies an approved proposal for a new item. An active item that closely matches its text holds
// the approval and is named in the result, so you answer again: as a revision of that item, which
// leaves the proposal's own key sealing nothing, or as a new item anyway.
export async function writeApprovedNewItem(
  parts: StoreParts,
  opened: OpenedProposal,
  answer: ProposalAnswer,
): Promise<ApprovalResult> {
  const revisionOf = answer.revisionOf;

  if (revisionOf !== undefined) {
    const ref = await writeApprovedRemember(parts, { opened, answer, target: revisionOf });

    // the closed-proposal sweep removes a key that a crash here leaves
    await removeRecordKey(parts.context.log, opened.row.item_id);
    return toAppliedResult(ref);
  }
  const match =
    answer.ignoreCloseMatch === true
      ? null
      : await findCloseMatch(parts, answer.editedText ?? opened.text.text);

  if (match !== null) {
    return { status: 'close_match', item: match };
  }
  const ref = await writeApprovedRemember(parts, { opened, answer, target: null });

  return toAppliedResult(ref);
}
