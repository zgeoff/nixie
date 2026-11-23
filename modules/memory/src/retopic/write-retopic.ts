import { withWriteTransaction } from '@heynixie/log';
import type { MemoryWriteVerdict } from '@heynixie/tools';
import type { Transaction } from 'kysely';
import type { WriteCaller } from '../gate/gate-context';
import { pickCoveringRule } from '../gate/pick-covering-rule';
import { readCurrentItemKey } from '../item-key/read-current-item-key';
import { writeLabelsInTransaction } from '../label/write-labels-in-transaction';
import { readNewestMessage } from '../message/read-newest-message';
import { requireSelfNoteCaller } from '../subject/require-self-note-caller';
import { requireSelfNoteOnlyWrite } from '../subject/require-self-note-only-write';
import type { Labels, MemoryTables, StoreParts } from '../types';
import { SelfNoteError } from '../utils/error/self-note-error';
import { TopicMoveError } from '../utils/error/topic-move-error';
import { buildWriteGroup } from '../write/build-write-group';
import { requireRetopicPlan } from './read-retopic-plan';
import type { RetopicMove, RetopicPlan, RetopicSource, RetopicTarget } from './types';

export interface RetopicRequest {
  readonly source: RetopicSource;
  readonly to: RetopicTarget;
  readonly caller: WriteCaller;

  // what the decision point said; a call with none ran after the user approved it
  readonly verdict?: MemoryWriteVerdict;

  // the IDs of the items that the approval card showed, for a call that ran after the user approved
  // it; a move of any other items refuses
  readonly shown?: readonly string[];
}

// Moves the items of the plan in one write transaction, and writes the same record per item that a
// label-only edit writes. A move that changes an item's subject carries the new subject in that
// record. The item's text never changes, so no version is added.
export function writeRetopic(parts: StoreParts, request: RetopicRequest): Promise<RetopicPlan> {
  return parts.lock(async () => {
    const plan = await requireRetopicPlan(parts, request.source, request.to);

    requireSelfNoteOnlyWrite(request.caller, [
      plan.to.subject,
      ...plan.moves.map((move) => move.fromSubject),
    ]);

    requireMoveCovered(plan, request);
    requireMoveShown(plan, request);

    const newest = await readNewestMessage(parts.context.log, request.caller.thread);

    const noticeKey = buildWriteGroup(request.caller, newest).noticeKey;

    // The label entries change inside the transaction, so a failed move puts them back.
    const before = plan.moves.map((move) => ({ move, labels: parts.labels.find(move.itemID) }));

    try {
      await withWriteTransaction(parts.context.log.writer, async (tx) => {
        for (const move of plan.moves) {
          await writeMove(parts, tx, { move, plan, request, noticeKey });
        }
      });
    } catch (error) {
      for (const entry of before) {
        await restoreLabels(parts, entry.move.itemID, entry.labels);
      }

      throw error;
    }

    return plan;
  });
}

// A move that touches a self-note needs an allow rule that checks subject, as a label edit of one
// does. Without such a rule, the move is a self-note write, which only a caller that writes
// self-notes makes, even after the user approved it.
function requireMoveCovered(plan: RetopicPlan, request: RetopicRequest): void {
  const touchesSelf =
    plan.to.subject === 'self' || plan.moves.some((move) => move.fromSubject === 'self');

  if (!touchesSelf || pickCoveringRule(request.verdict, 'self_note') !== null) {
    return;
  }

  if (request.verdict?.kind === 'rule-allow') {
    throw new SelfNoteError(
      'a move that touches a self-note needs an allow rule that checks subject eq self',
    );
  }

  requireSelfNoteCaller(request.caller);
}

// The user approved the items on the card, so a move of other items, such as one added to the topic
// since, waits for a new card.
function requireMoveShown(plan: RetopicPlan, request: RetopicRequest): void {
  if (request.shown === undefined) {
    return;
  }

  const shown = new Set(request.shown);

  if (plan.moves.length !== shown.size || plan.moves.some((move) => !shown.has(move.itemID))) {
    throw new TopicMoveError(
      'CHANGED_SINCE_SHOWN',
      'refused: the items of this move changed after the card showed them, so ask for the move again',
    );
  }
}

interface MoveWrite {
  readonly move: RetopicMove;
  readonly plan: RetopicPlan;
  readonly request: RetopicRequest;
  readonly noticeKey: string;
}

async function writeMove(
  parts: StoreParts,
  tx: Transaction<unknown>,
  write: MoveWrite,
): Promise<void> {
  const move = write.move;
  const plan = write.plan;
  const request = write.request;
  const log = parts.context.log;

  const item = await tx
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['version', 'label_edits', 'state'])
    .where('item_id', '=', move.itemID)
    .executeTakeFirst();

  const current = await readCurrentItemKey(log, move.itemID, tx);

  const labels = parts.labels.find(move.itemID);

  if (
    item === undefined ||
    (item.state !== 'active' && item.state !== 'retired') ||
    current.status !== 'readable' ||
    labels === undefined
  ) {
    throw new TopicMoveError('UNKNOWN_ITEM', `refused: no memory item ${move.shortID} to move`);
  }

  const caller = request.caller;

  await writeLabelsInTransaction(parts, tx, {
    itemID: move.itemID,
    key: current.key,
    revision: item.version + item.label_edits + 1,
    version: item.version,
    change: 'edited',
    labels: { ...labels, topic: move.toTopic },
    origin: caller.origin,
    source: 'untrusted',
    taskID: caller.taskID,
    proposalID: null,
    model: caller.model,
    thread: caller.thread,
    noticeKey: write.noticeKey,
    ...(move.fromSubject === plan.to.subject
      ? {}
      : { subjectMove: { subject: plan.to.subject, previousSubject: move.fromSubject } }),
  });
}

async function restoreLabels(
  parts: StoreParts,
  itemID: string,
  labels: Labels | undefined,
): Promise<void> {
  if (labels !== undefined) {
    parts.labels.set(itemID, labels);

    await parts.triggers.set(itemID, labels.triggers);
  }
}
