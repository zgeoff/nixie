import { removeRecordKey } from '@heynixie/log';
import { CloseMatchError } from './close-match-error';
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
  if (answer.ignoreCloseMatch === true) {
    const ref = await writeApprovedRemember(parts, { opened, answer, target: null });

    return toAppliedResult(ref);
  }
  return writeUnmatchedNewItem(parts, opened, answer);
}

// The search runs before the delivery lock, so the write searches again under it: a concurrent
// approval of a reworded proposal may have created the match since. That write applies nothing,
// and the approval starts over to report the match.
async function writeUnmatchedNewItem(
  parts: StoreParts,
  opened: OpenedProposal,
  answer: ProposalAnswer,
): Promise<ApprovalResult> {
  const text = answer.editedText ?? opened.text.text;
  const match = await findCloseMatch(parts, { text });

  if (match !== null) {
    return { status: 'close_match', item: match };
  }
  try {
    const ref = await writeApprovedRemember(parts, {
      opened,
      answer,
      target: null,
      requireInTransaction: async (db) => {
        if ((await findCloseMatch(parts, { text, db })) !== null) {
          throw new CloseMatchError(opened.row.proposal_id);
        }
      },
    });

    return toAppliedResult(ref);
  } catch (error) {
    if (!(error instanceof CloseMatchError)) {
      throw error;
    }
    return writeUnmatchedNewItem(parts, opened, answer);
  }
}
