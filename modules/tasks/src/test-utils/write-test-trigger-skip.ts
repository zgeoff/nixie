import { writeRecords } from '@heynixie/log';
import { triggerSkippedCodec } from '../task/codec/trigger-skipped-codec';
import type { TasksContext } from '../types';

type Skip = Parameters<typeof triggerSkippedCodec.encode>[0];

// Writes a trigger.skipped record on the task's thread, as the trigger core would, and returns its
// sequence.
export async function writeTestTriggerSkip(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  taskID: string,
  skip: Partial<Skip> & Pick<Skip, 'definitionID'>,
): Promise<number> {
  const [record] = await writeRecords(context.log, [
    {
      kind: 'trigger.skipped',
      definitions: context.definitions(),
      thread: taskID,
      payload: triggerSkippedCodec.encode({
        source: 'schedule',
        dedupeKey: `${skip.definitionID}|2027-03-10T21:00:00.000Z`,
        scheduledFor: ['2027-03-10T21:00:00.000Z'],
        count: 1,
        reason: 'too_late',
        recordedAt: '2027-03-11T09:00:00.000Z',
        ...skip,
      }),
    },
  ]);

  if (record === undefined) {
    throw new Error('the skip wrote no record');
  }

  return record.sequence;
}
