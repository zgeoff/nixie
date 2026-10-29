import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { taskRouteCorrectedCodec } from './task-route-corrected-codec';
import { taskRoutedCodec } from './task-routed-codec';
import type { TasksTables } from './types';

export const messageRoutesProjection: Projection = {
  table: 'message_routes',
  keyColumn: 'message_sequence',
  fold: (tx, record) => {
    const db = tx.$extendTables<TasksTables>();

    if (record.kind === 'task.routed') {
      const routed = taskRoutedCodec.decode(record.payload);

      return writeRoutes(db, record, routed.messages, routed.taskID);
    }

    if (record.kind === 'task.route_corrected') {
      const corrected = taskRouteCorrectedCodec.decode(record.payload);

      return writeRoutes(db, record, [corrected.message], corrected.to);
    }

    return Promise.resolve([]);
  },
};

async function writeRoutes(
  db: Transaction<TasksTables>,
  record: EnvelopeRecord,
  messages: readonly number[],
  taskID: string,
): Promise<readonly string[]> {
  for (const message of messages) {
    await db
      .insertInto('message_routes')
      .values({ message_sequence: message, task_id: taskID, routed_sequence: record.sequence })
      .onConflict((conflict) =>
        conflict
          .column('message_sequence')
          .doUpdateSet({ task_id: taskID, routed_sequence: record.sequence }),
      )
      .execute();
  }

  return messages.map(String);
}
