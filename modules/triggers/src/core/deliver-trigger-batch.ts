import type { JSONValue, RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { DefinitionTaskAnswer, TasksTables } from '@heynixie/tasks';
import {
  conversationTaskID,
  isFinishedState,
  readTaskGate,
  triggerFiredCodec,
  triggerSkippedCodec,
  triggerTaskInputCodec,
  waitAtFaultPoint,
  writeInboxRecordsInTransaction,
} from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { triggerArmedCodec } from '../record/trigger-armed-codec';
import { triggerDeliveredCodec } from '../record/trigger-delivered-codec';
import type {
  ScheduleTriggerEvent,
  TaskInputEvent,
  TriggerBatch,
  TriggerCoreContext,
  TriggersTables,
} from '../types';
import { buildSourceKey } from '../utils/build-source-key';
import { toCanonicalJSON } from '../utils/to-canonical-json';
import { catchUpThresholdMs, maxSkippedSlots } from './constants';
import { isEventDeliverable } from './is-event-deliverable';
import type { EventOutcome } from './pick-event-outcome';
import { pickEventOutcome } from './pick-event-outcome';

// One write transaction for one deliver call: each event writes its record and takes its key, and
// the cursor is stored when it changed. Returns the number of events that wrote a record.
export async function deliverTriggerBatch(
  core: TriggerCoreContext,
  sourceID: string,
  batch: TriggerBatch,
): Promise<{ readonly delivered: number }> {
  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('trigger.batch.before', { kind: 'trigger', id: sourceID });
  }

  const result = await withWriteTransaction(core.log.writer, async (tx) => {
    let delivered = 0;

    for (const event of batch.events) {
      const isWritten =
        event.kind === 'task_input'
          ? await writeTaskInput(tx, core, sourceID, event)
          : await writeEvent(tx, core, sourceID, event);

      if (isWritten) {
        delivered += 1;
      }
    }

    await writeCursor(tx, core, sourceID, batch.cursor);

    return { delivered };
  });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('trigger.batch.after', { kind: 'trigger', id: sourceID });
  }

  return result;
}

// An event that names its task reads no definition. It is dropped when its key is held or its task
// is missing or ended, and otherwise lands on the task's thread: in the inbox when it wakes the task.
async function writeTaskInput(
  tx: Transaction<unknown>,
  core: TriggerCoreContext,
  sourceID: string,
  event: TaskInputEvent,
): Promise<boolean> {
  const key = await tx
    .$extendTables<TriggersTables>()
    .selectFrom('trigger_keys')
    .select('source_key')
    .where('source_key', '=', buildSourceKey(sourceID, event.dedupeKey))
    .executeTakeFirst();

  const task = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', event.taskID)
    .executeTakeFirst();

  if (key !== undefined || task === undefined || isFinishedState(task.state)) {
    return false;
  }

  const input: RecordInput = {
    kind: 'trigger.task_input',
    definitions: core.definitions(),
    thread: event.taskID,
    payload: triggerTaskInputCodec.encode({
      taskID: event.taskID,
      source: sourceID,
      dedupeKey: event.dedupeKey,
      occurredAt: event.occurredAt,
      hop: event.hop,
      wake: event.wake,
      facts: event.facts,
    }),
    erasable: { event: event.payload },
  };

  await (event.wake
    ? writeInboxRecordsInTransaction(tx, core, [input])
    : writeRecordsInTransaction(tx, core.log, [input]));

  return true;
}

async function writeEvent(
  tx: Transaction<unknown>,
  core: TriggerCoreContext,
  sourceID: string,
  event: ScheduleTriggerEvent,
): Promise<boolean> {
  const db = tx.$extendTables<TriggersTables>();

  const key = await db
    .selectFrom('trigger_keys')
    .select('source_key')
    .where('source_key', '=', buildSourceKey(sourceID, event.dedupeKey))
    .executeTakeFirst();

  const row = await db
    .selectFrom('trigger_definitions')
    .select(['source_id', 'definition_hash', 'after', 'target'])
    .where('definition_id', '=', event.definitionID)
    .executeTakeFirst();

  if (row === undefined || !isEventDeliverable(event, sourceID, row, key !== undefined)) {
    return false;
  }

  const answer = row.target === 'task' ? await readTaskAnswer(tx, core, event.definitionID) : null;
  const holdsConversation = answer === null ? await probeConversationWaiting(tx) : false;
  const outcome = pickEventOutcome(event, answer, holdsConversation);

  if (outcome.kind === 'wait') {
    return false;
  }

  if (outcome.kind === 'fire') {
    await writeInboxRecordsInTransaction(tx, core, [
      buildFired(core, sourceID, event, outcome.thread),
    ]);
  } else {
    await writeRecordsInTransaction(tx, core.log, [buildSkipped(core, sourceID, event, outcome)]);
  }

  if (event.kind === 'at') {
    await retireOneShot(tx, core, event.definitionID, outcome.kind);
  }

  return true;
}

async function readTaskAnswer(
  tx: Transaction<unknown>,
  core: TriggerCoreContext,
  definitionID: string,
): Promise<DefinitionTaskAnswer> {
  const answer = await core.readDefinitionTask(tx, definitionID);

  if (answer === null) {
    throw new Error(
      `the definition ${definitionID} has no task: the seed binds it before it arms it`,
    );
  }

  return answer;
}

// A conversation target fires into a conversation that its owner paused, so a reminder still
// lands. It waits for nixie's pause and the spending stop, which hold whatever the task's state.
async function probeConversationWaiting(tx: Transaction<unknown>): Promise<boolean> {
  const gate = await readTaskGate(tx, conversationTaskID, 'conversation_trigger');

  return !gate.open;
}

function buildFired(
  core: TriggerCoreContext,
  sourceID: string,
  event: ScheduleTriggerEvent,
  thread: string,
): RecordInput {
  const firedAt = core.clock.now();

  return {
    kind: 'trigger.fired',
    definitions: core.definitions(),
    thread,
    payload: triggerFiredCodec.encode({
      definitionID: event.definitionID,
      definitionHash: event.definitionHash,
      source: sourceID,
      dedupeKey: event.dedupeKey,
      kind: event.kind,
      scheduledFor: event.scheduledFor,
      firedAt: new Date(firedAt).toISOString(),
      isCatchUp: firedAt - Date.parse(event.scheduledFor) > catchUpThresholdMs,
      skipped: event.missed,
      skippedCount: event.missedCount,
    }),
  };
}

function buildSkipped(
  core: TriggerCoreContext,
  sourceID: string,
  event: ScheduleTriggerEvent,
  outcome: Extract<EventOutcome, { readonly kind: 'skip' }>,
): RecordInput {
  return {
    kind: 'trigger.skipped',
    definitions: core.definitions(),
    thread: outcome.thread,
    payload: triggerSkippedCodec.encode({
      definitionID: event.definitionID,
      source: sourceID,
      dedupeKey: event.dedupeKey,
      scheduledFor: [...event.missed, event.scheduledFor].slice(-maxSkippedSlots),
      count: event.missedCount + 1,
      reason: outcome.reason,
      recordedAt: new Date(core.clock.now()).toISOString(),
    }),
  };
}

// A one-shot is out of force with no seed: the arming row and the task's hash both go.
async function retireOneShot(
  tx: Transaction<unknown>,
  core: TriggerCoreContext,
  definitionID: string,
  outcome: EventOutcome['kind'],
): Promise<void> {
  await writeRecordsInTransaction(tx, core.log, [
    {
      kind: 'trigger.armed',
      definitions: core.definitions(),
      payload: triggerArmedCodec.encode({ armed: [], withdrawn: [definitionID] }),
    },
  ]);

  const cause = outcome === 'fire' ? 'one_shot_fired' : 'one_shot_skipped';

  await core.retireOneShot(tx, definitionID, cause);
}

async function writeCursor(
  tx: Transaction<unknown>,
  core: TriggerCoreContext,
  sourceID: string,
  cursor: JSONValue,
): Promise<void> {
  const stored = await tx
    .$extendTables<TriggersTables>()
    .selectFrom('trigger_sources')
    .select('cursor')
    .where('source_id', '=', sourceID)
    .executeTakeFirst();

  const storedCursor: unknown =
    stored?.cursor === undefined || stored.cursor === null ? null : JSON.parse(stored.cursor);

  if (toCanonicalJSON(storedCursor) === toCanonicalJSON(cursor)) {
    return;
  }

  await writeRecordsInTransaction(tx, core.log, [
    {
      kind: 'trigger.delivered',
      definitions: core.definitions(),
      payload: triggerDeliveredCodec.encode({ source: sourceID, cursor }),
    },
  ]);
}
