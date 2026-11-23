import type { LogRecord } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { buildModelEventRecord, modelSessionOpenedCodec } from '@heynixie/models';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';

// Leaves the record that the first opening of a conversation session writes, and returns it.
export async function seedSessionOpened(
  context: Pick<TasksContext, 'log' | 'definitions'>,
): Promise<LogRecord> {
  const opened = buildModelEventRecord(
    {
      definitions: context.definitions,
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
    modelSessionOpenedCodec,
    {
      kind: 'first',
      reason: null,
      lostSessionID: null,
      summarySequence: null,
      recentRecords: 0,
      recentEvents: 0,
      recalledThrough: 0,
      status: {},
      personaHash: 'sha256:persona-test',
      policyHash: 'sha256:policy-test',
    },
  );

  const [record] = await writeRecords(context.log, [{ ...opened, thread: conversationTaskID }]);

  invariant(record, 'the session opening wrote no record');

  return record;
}
