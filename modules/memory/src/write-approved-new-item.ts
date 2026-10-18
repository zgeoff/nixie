import { removeRecordKey } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { CloseMatchError } from './close-match-error';
import { findCloseMatch } from './find-close-match';
import type { ApprovalResult, ProposalAnswer } from './gate-types';
import { getRowSubject } from './get-row-subject';
import type { OpenedProposal } from './read-open-proposal';
import { SelfNoteError } from './self-note-error';
import { toAppliedResult } from './to-applied-result';
import type { MemorySubject, MemoryTables, StoreParts } from './types';
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
    const ref = await writeApprovedRemember(parts, {
      opened,
      answer,
      target: revisionOf,
      requireInTransaction: (db) =>
        requireSameSubject(db, revisionOf.itemID, getRowSubject(opened.row)),
    });

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
  const query = { text: answer.editedText ?? opened.text.text, subject: getRowSubject(opened.row) };

  const match = await findCloseMatch(parts, query);

  if (match !== null) {
    return { status: 'close_match', item: match };
  }

  try {
    const ref = await writeApprovedRemember(parts, {
      opened,
      answer,
      target: null,
      requireInTransaction: async (db) => {
        if ((await findCloseMatch(parts, { ...query, db })) !== null) {
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

// a proposal revises only an item of its own subject, because an item keeps its subject
async function requireSameSubject(
  db: Kysely<MemoryTables>,
  itemID: string,
  subject: MemorySubject,
): Promise<void> {
  const item = await db
    .selectFrom('memory_items')
    .select(['kind', 'subject'])
    .where('item_id', '=', itemID)
    .executeTakeFirst();

  if (item !== undefined && getRowSubject(item) !== subject) {
    throw new SelfNoteError(
      `memory item ${itemID} is not ${subjectNames[subject]}, so it cannot take this text`,
    );
  }
}

const subjectNames: Readonly<Record<MemorySubject, string>> = {
  owner: 'a fact about the owner',
  self: 'a self-note',
  shared: 'a shared item',
};
