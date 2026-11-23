import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { MemoryWriteVerdict } from '@heynixie/tools';
import type { Transaction } from 'kysely';
import type { WriteCaller } from '../gate/gate-context';
import { pickCoveringRule } from '../gate/pick-covering-rule';
import { readCurrentItemKey } from '../item-key/read-current-item-key';
import { writeLabelsInTransaction } from '../label/write-labels-in-transaction';
import { readNewestMessage } from '../message/read-newest-message';
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
}

// Moves the items of the plan in one write transaction, and writes the same record per item that a
// label-only edit writes. A move that changes an item's subject also writes the subject change
// record, on the item's current version. The item's text never changes, so no version is added.
export function writeRetopic(parts: StoreParts, request: RetopicRequest): Promise<RetopicPlan> {
  return parts.lock(async () => {
    const plan = await requireRetopicPlan(parts, request.source, request.to);

    requireMoveCovered(plan, request);

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
// does, unless the user approved the call.
function requireMoveCovered(plan: RetopicPlan, request: RetopicRequest): void {
  const touchesSelf =
    plan.to.subject === 'self' || plan.moves.some((move) => move.fromSubject === 'self');

  if (!touchesSelf) {
    return;
  }

  const covering = pickCoveringRule(request.verdict, 'self_note');

  if (request.verdict?.kind === 'rule-allow' && covering === null) {
    throw new SelfNoteError(
      'a move that touches a self-note needs an allow rule that checks subject eq self',
    );
  }

  if (request.verdict === undefined && request.caller.origin !== 'conversation') {
    throw new SelfNoteError(
      `only the conversation moves a self-note, and this write came from the ${request.caller.origin}`,
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
  });

  if (move.fromSubject !== plan.to.subject) {
    const changed: RecordInput = {
      kind: 'memory.subject_changed',
      definitions: parts.context.definitions(),
      thread: caller.thread,
      payload: {
        itemID: move.itemID,
        version: item.version,
        subject: plan.to.subject,
        previousSubject: move.fromSubject,
      },
    };

    await writeRecordsInTransaction(tx, log, [changed]);
  }
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
