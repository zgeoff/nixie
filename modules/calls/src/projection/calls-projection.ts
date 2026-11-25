import { budgetChargedCodec } from '@heynixie/budgets';
import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { match } from 'ts-pattern';
import { callAnsweredCodec } from '../record/call-answered-codec';
import { callRangCodec } from '../record/call-rang-codec';
import { callStartedCodec } from '../record/call-started-codec';
import type { CallsTables } from '../types';
import { callBudgetIDs } from '../utils/call-budget-ids';
import { callEndedCodec } from '../utils/call-ended-codec';

// One row per call. It folds the call's own records and the charge of each of its minutes, which
// moves a connecting call to live and counts the minutes. It reads no erasable field.
export const callsProjection: Projection = {
  table: 'calls',
  keyColumn: 'call_id',
  fold: (tx, record) => {
    const db = tx.$extendTables<CallsTables>();

    return match(record.kind)
      .with('call.started', () => foldStarted(db, record))
      .with('call.rang', () => foldRang(db, record))
      .with('call.answered', () => foldAnswered(db, record))
      .with('call.ended', () => foldEnded(db, record))
      .with('budget.charged', () => foldMinuteCharged(db, record))
      .otherwise(() => Promise.resolve([]));
  },
};

async function foldStarted(
  db: Transaction<CallsTables>,
  record: EnvelopeRecord,
): Promise<string[]> {
  const started = callStartedCodec.decode(record.payload);

  await db
    .insertInto('calls')
    .values({
      call_id: started.callID,
      task_id: started.taskID,
      state: started.startedBy === 'nixie' ? 'ringing' : 'connecting',
      started_by: started.startedBy,
      carrying_session: started.carryingSession,
      started_at: record.recordedAt.getTime(),
      connected_at: null,
      ended_at: null,
      ended_by: null,
      minutes: 0,
      updated_sequence: record.sequence,
    })
    .onConflict((conflict) => conflict.column('call_id').doNothing())
    .execute();

  return [started.callID];
}

// A ring leaves the call ringing, and the row changes so that its watchers see the ring.
async function foldRang(db: Transaction<CallsTables>, record: EnvelopeRecord): Promise<string[]> {
  const rang = callRangCodec.decode(record.payload);

  await db
    .updateTable('calls')
    .set({ updated_sequence: record.sequence })
    .where('call_id', '=', rang.callID)
    .where('state', '=', 'ringing')
    .execute();

  return [rang.callID];
}

async function foldAnswered(
  db: Transaction<CallsTables>,
  record: EnvelopeRecord,
): Promise<string[]> {
  const answered = callAnsweredCodec.decode(record.payload);

  await db
    .updateTable('calls')
    .set({
      state: 'connecting',
      carrying_session: answered.carryingSession,
      updated_sequence: record.sequence,
    })
    .where('call_id', '=', answered.callID)
    .where('state', 'in', ['ringing', 'connecting'])
    .execute();

  return [answered.callID];
}

async function foldEnded(db: Transaction<CallsTables>, record: EnvelopeRecord): Promise<string[]> {
  const ended = callEndedCodec.decode(record.payload);

  await db
    .updateTable('calls')
    .set({
      state: 'ended',
      ended_at: record.recordedAt.getTime(),
      ended_by: ended.endedBy,
      updated_sequence: record.sequence,
    })
    .where('call_id', '=', ended.callID)
    .where('state', '!=', 'ended')
    .execute();

  return [ended.callID];
}

// A call charges each minute against every call budget, so one of them counts the minute.
async function foldMinuteCharged(
  db: Transaction<CallsTables>,
  record: EnvelopeRecord,
): Promise<string[]> {
  const charged = budgetChargedCodec.decode(record.payload);

  if (charged.for.kind !== 'call_minute' || charged.budgetID !== callBudgetIDs[0]) {
    return [];
  }

  await db
    .updateTable('calls')
    .set((expressions) => ({
      minutes: expressions('minutes', '+', 1),
      connected_at: expressions.fn.coalesce(
        'connected_at',
        expressions.val(record.recordedAt.getTime()),
      ),
      state: expressions
        .case()
        .when('state', '=', 'connecting')
        .then('live')
        .else(expressions.ref('state'))
        .end(),
      updated_sequence: record.sequence,
    }))
    .where('call_id', '=', charged.for.id)
    .where('state', '!=', 'ended')
    .execute();

  return [charged.for.id];
}
