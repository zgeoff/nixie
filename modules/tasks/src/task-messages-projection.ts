import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { collectTaskWaitSources } from './collect-task-wait-sources';
import { isWaitingKind } from './is-waiting-kind';
import { parseTaskRecord } from './parse-task-record';
import { taskMessageCodec } from './task-message-codec';
import type { TasksTables } from './types';

export const taskMessagesProjection: Projection = {
  table: 'task_messages',
  keyColumn: 'message_id',
  fold: (tx, record) => {
    const db = tx.$extendTables<TasksTables>();

    if (record.kind === 'task_message') {
      return insertMessage(db, record);
    }

    const parsed = parseTaskRecord(record);

    const finished =
      (parsed?.kind === 'task.step_committed' && parsed.nextState === 'done') ||
      (parsed?.kind === 'task.step_errored' && parsed.nextState === 'failed');

    return finished ? releaseWaits(db, parsed.taskID) : Promise.resolve([]);
  },
};

async function insertMessage(
  db: Transaction<TasksTables>,
  record: EnvelopeRecord,
): Promise<readonly string[]> {
  const message = taskMessageCodec.decode(record.payload);

  await db
    .insertInto('task_messages')
    .values({
      message_id: message.messageID,
      from_task: message.from,
      to_task: message.to,
      kind: message.kind,
      reply_to: message.replyTo,
      wait_state: (message.opensWait ?? isWaitingKind(message.kind)) ? 'open' : 'none',
      sent_sequence: record.sequence,
    })
    .execute();

  if (message.kind !== 'reply' || message.replyTo === null) {
    return [message.messageID];
  }

  const answered = await db
    .updateTable('task_messages')
    .set({ wait_state: 'answered' })
    .where('message_id', '=', message.replyTo)
    .where('from_task', '=', message.to)
    .where('to_task', '=', message.from)
    .where('wait_state', 'in', collectTaskWaitSources('answered'))
    .returning('message_id')
    .execute();

  return [message.messageID, ...answered.map((row) => row.message_id)];
}

async function releaseWaits(
  db: Transaction<TasksTables>,
  taskID: string,
): Promise<readonly string[]> {
  const released = await db
    .updateTable('task_messages')
    .set({ wait_state: 'released' })
    .where('wait_state', 'in', collectTaskWaitSources('released'))
    .where((eb) => eb.or([eb('from_task', '=', taskID), eb('to_task', '=', taskID)]))
    .returning('message_id')
    .execute();

  return released.map((row) => row.message_id);
}
