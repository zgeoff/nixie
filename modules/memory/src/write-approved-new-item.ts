import { removeRecordKey } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { CloseMatchError } from './close-match-error';
import { findCloseMatch } from './find-close-match';
import type { ApprovalResult, ProposalAnswer } from './gate-types';
import type { OpenedProposal } from './read-open-proposal';
import { SelfNoteError } from './self-note-error';
import { toAppliedResult } from './to-applied-result';
import type { MemoryKind, MemoryTables, StoreParts } from './types';
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
      requireInTransaction: (db) => requireSameKind(db, revisionOf.itemID, opened.row.kind),
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
  const query = { text: answer.editedText ?? opened.text.text, kind: opened.row.kind };

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

// a fact never revises a self-note, nor a self-note a fact, because an item keeps its kind
async function requireSameKind(
  db: Kysely<MemoryTables>,
  itemID: string,
  kind: MemoryKind,
): Promise<void> {
  const item = await db
    .selectFrom('memory_items')
    .select('kind')
    .where('item_id', '=', itemID)
    .executeTakeFirst();

  if (item !== undefined && item.kind !== kind) {
    throw new SelfNoteError(
      `memory item ${itemID} is not a ${kindNames[kind]}, so it cannot take this text`,
    );
  }
}

const kindNames: Readonly<Record<MemoryKind, string>> = { fact: 'fact', self: 'self-note' };
