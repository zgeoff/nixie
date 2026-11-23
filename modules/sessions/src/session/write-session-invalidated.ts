import type { LogRecord } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { modelSessionInvalidatedCodec } from '@heynixie/models';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { SessionCleanupCause } from '../types';

// Records that the conversation's session no longer holds what it held, and returns the record.
export async function writeSessionInvalidated(
  context: Pick<TasksContext, 'log' | 'definitions'>,
  cause: SessionCleanupCause,
): Promise<LogRecord> {
  const [record] = await writeRecords(context.log, [
    {
      kind: modelSessionInvalidatedCodec.kind,
      definitions: context.definitions(),
      thread: conversationTaskID,
      payload: modelSessionInvalidatedCodec.encode(cause),
    },
  ]);

  invariant(record, 'the invalidation wrote no record');

  return record;
}
