import type { Transaction } from 'kysely';
import { taskMessageCodec } from './task-message-codec';
import type { TasksContext } from './types';
import { writeInboxRecordsInTransaction } from './write-inbox-records-in-transaction';

export interface BriefMessage {
  readonly messageID: string;
  readonly from: string;
  readonly to: string;
  readonly hopLimit: number;
  readonly body: string;
}

// The only writer of a brief record. The caller holds the write transaction that wrote the task,
// so the task and its brief commit together or not at all.
export async function writeBriefMessageInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'definitions' | 'log'>,
  brief: BriefMessage,
): Promise<void> {
  await writeInboxRecordsInTransaction(tx, context, [
    {
      kind: 'task_message',
      definitions: context.definitions(),
      thread: brief.to,
      payload: taskMessageCodec.encode({
        messageID: brief.messageID,
        from: brief.from,
        to: brief.to,
        kind: 'request',
        replyTo: null,
        onBehalfOf: [],
        hop: 0,
        hopLimit: brief.hopLimit,
        wake: true,
        woke: true,
        opensWait: false,
        source: `task:${brief.from}`,
      }),
      erasable: { body: brief.body },
    },
  ]);
}
