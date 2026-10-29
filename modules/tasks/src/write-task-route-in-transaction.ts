import { parseJSONObject, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { conversationTaskID } from './conversation-task-id';
import { taskMessageMovedCodec } from './task-message-moved-codec';
import { taskRoutedCodec } from './task-routed-codec';
import type { TasksContext, TasksTables } from './types';

export interface TaskRoute {
  readonly taskID: string;
  readonly via: 'start' | 'message';
  readonly messageID: string | null;
  readonly onBehalfOf: readonly string[];
}

export async function writeTaskRouteInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'definitions' | 'log'>,
  route: TaskRoute,
): Promise<void> {
  const messages =
    route.onBehalfOf.length === 0
      ? await readUnreadOwnerMessages(tx)
      : route.onBehalfOf.map(Number);

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'task.routed',
      definitions: context.definitions(),
      thread: conversationTaskID,
      payload: taskRoutedCodec.encode({
        taskID: route.taskID,
        via: route.via,
        messageID: route.messageID,
        messages,
      }),
    },
  ]);
}

async function readUnreadOwnerMessages(tx: Transaction<unknown>): Promise<readonly number[]> {
  const db = tx.$extendTables<TasksTables>();

  const task = await db
    .selectFrom('tasks')
    .select('read_cursor')
    .where('task_id', '=', conversationTaskID)
    .executeTakeFirstOrThrow();

  const rows = await db
    .selectFrom('records')
    .select(['sequence', 'kind', 'payload'])
    .where('thread', '=', conversationTaskID)
    .where('kind', 'in', ['owner_message', 'task.message_moved'])
    .where('sequence', '>', task.read_cursor)
    .orderBy('sequence')
    .execute();

  return rows.flatMap((row) => {
    if (row.kind === 'owner_message') {
      return [row.sequence];
    }

    const moved = taskMessageMovedCodec.decode(parseJSONObject(row.payload));

    return moved.to === conversationTaskID ? [moved.message] : [];
  });
}
