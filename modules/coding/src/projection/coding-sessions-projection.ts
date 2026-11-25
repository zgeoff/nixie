import type { EnvelopeRecord, Projection } from '@heynixie/log';
import { triggerTaskInputCodec } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { codingAnswerHeldCodec } from '../record/coding-answer-held-codec';
import { codingDeliveredCodec } from '../record/coding-delivered-codec';
import { codingSessionBoundCodec } from '../record/coding-session-bound-codec';
import { codingSessionUnboundCodec } from '../record/coding-session-unbound-codec';
import { codingSteeredCodec } from '../record/coding-steered-codec';
import { codingWakeSetCodec } from '../record/coding-wake-set-codec';
import { sessionStateSchema } from '../record/session-state-schema';
import type { CodingTables } from '../types';
import { codingSourcePrefix } from './coding-source-prefix';
import { heldAnswersSchema } from './held-answers-schema';

// One row per coding task: the session it binds, once. It folds the records of the coding module
// and the events that the coding source delivers, and reads no erasable field.
export const codingSessionsProjection: Projection = {
  table: 'coding_sessions',
  keyColumn: 'task_id',
  fold: (tx, record) => {
    const db = tx.$extendTables<CodingTables>();

    return match(record.kind)
      .with('coding.session_bound', () => foldBound(db, record))
      .with('coding.steered', () => {
        const steered = codingSteeredCodec.decode(record.payload);

        return updateRow(db, steered.taskID, record, { hop: steered.hop });
      })
      .with('coding.delivered', () => foldDelivered(db, record))
      .with('coding.answer_held', () => foldHeld(db, record))
      .with('coding.wake_set', () => {
        const set = codingWakeSetCodec.decode(record.payload);

        return updateRow(db, set.taskID, record, { wake: JSON.stringify(set.wake) });
      })
      .with('coding.session_unbound', () => {
        const unbound = codingSessionUnboundCodec.decode(record.payload);

        return updateRow(db, unbound.taskID, record, { unbound_at: record.recordedAt.getTime() });
      })
      .with('trigger.task_input', () => foldTaskInput(db, record))
      .otherwise(() => Promise.resolve([]));
  },
};

async function foldBound(db: Transaction<CodingTables>, record: EnvelopeRecord): Promise<string[]> {
  const bound = codingSessionBoundCodec.decode(record.payload);

  await db
    .insertInto('coding_sessions')
    .values({
      task_id: bound.taskID,
      adapter: bound.adapter,
      session_id: bound.sessionID,
      origin: bound.origin,
      state: bound.state,
      wake: JSON.stringify(bound.wake),
      hop: bound.hop,
      from_cursor: bound.fromCursor,
      last_event_at: null,
      unbound_at: null,
      updated_sequence: record.sequence,
      held_answers: '[]',
    })
    .onConflict((conflict) => conflict.column('task_id').doNothing())
    .execute();

  return [bound.taskID];
}

type RowUpdate = Partial<
  Pick<
    CodingTables['coding_sessions'],
    'hop' | 'held_answers' | 'wake' | 'unbound_at' | 'last_event_at' | 'state'
  >
>;

// A record of a task that binds no session changes no row.
async function updateRow(
  db: Transaction<CodingTables>,
  taskID: string,
  record: EnvelopeRecord,
  set: RowUpdate,
): Promise<string[]> {
  const updated = await db
    .updateTable('coding_sessions')
    .set({ ...set, updated_sequence: record.sequence })
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  return updated.numUpdatedRows > 0n ? [taskID] : [];
}

async function foldDelivered(
  db: Transaction<CodingTables>,
  record: EnvelopeRecord,
): Promise<string[]> {
  const delivered = codingDeliveredCodec.decode(record.payload);

  const held = await readHeld(db, delivered.taskID);

  return updateRow(db, delivered.taskID, record, {
    hop: delivered.hop,
    held_answers: JSON.stringify(
      held.filter((answer) => answer.messageRef !== delivered.messageRef),
    ),
  });
}

async function readHeld(
  db: Transaction<CodingTables>,
  taskID: string,
): Promise<z.output<typeof heldAnswersSchema>> {
  const row = await db
    .selectFrom('coding_sessions')
    .select('held_answers')
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  return row === undefined ? [] : heldAnswersSchema.parse(JSON.parse(row.held_answers));
}

async function foldHeld(db: Transaction<CodingTables>, record: EnvelopeRecord): Promise<string[]> {
  const held = codingAnswerHeldCodec.decode(record.payload);

  const answers = await readHeld(db, held.taskID);

  return updateRow(db, held.taskID, record, {
    held_answers: JSON.stringify([
      ...answers,
      { messageRef: held.messageRef, sequence: held.sequence },
    ]),
  });
}

const stateFactsSchema = z.object({ kind: z.literal('state'), state: sessionStateSchema });

function foldTaskInput(db: Transaction<CodingTables>, record: EnvelopeRecord): Promise<string[]> {
  const input = triggerTaskInputCodec.decode(record.payload);

  if (!input.source.startsWith(codingSourcePrefix)) {
    return Promise.resolve([]);
  }

  const state = stateFactsSchema.safeParse(input.facts);

  return updateRow(db, input.taskID, record, {
    last_event_at: Date.parse(input.occurredAt),
    ...(state.success ? { state: state.data.state } : {}),
  });
}
