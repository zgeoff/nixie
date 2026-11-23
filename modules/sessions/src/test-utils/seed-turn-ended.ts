import type { LogRecord } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { buildModelEventRecord, modelTurnEndedCodec } from '@heynixie/models';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';

// Leaves the record that a finished turn of the conversation writes, and returns it.
export async function seedTurnEnded(
  context: Pick<TasksContext, 'log' | 'definitions'>,
): Promise<LogRecord> {
  const ended = buildModelEventRecord(
    {
      definitions: context.definitions,
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
    modelTurnEndedCodec,
    {
      stopReason: null,
      turns: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      pinnedCore: [],
      retrieved: [],
      invalidatedThrough: 0,
      sessionImageBytes: 0,
      sessionImageCount: 0,
    },
  );

  const [record] = await writeRecords(context.log, [{ ...ended, thread: conversationTaskID }]);

  invariant(record, 'the turn end wrote no record');

  return record;
}
