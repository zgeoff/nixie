import { writeRecords } from '@heynixie/log';
import { triggerFiredCodec } from '../task/codec/trigger-fired-codec';
import type { TasksContext } from '../types';

type Fire = Parameters<typeof triggerFiredCodec.encode>[0];

// Writes a trigger.fired record on the task's thread, as the trigger core would, and returns its
// sequence.
export async function writeTestTriggerFire(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  taskID: string,
  fire: Partial<Fire> & Pick<Fire, 'definitionHash'>,
): Promise<number> {
  const [record] = await writeRecords(context.log, [
    {
      kind: 'trigger.fired',
      definitions: context.definitions(),
      thread: taskID,
      payload: triggerFiredCodec.encode({
        definitionID: 'water-the-tomatoes',
        source: 'schedule',
        dedupeKey: 'water-the-tomatoes:2027-03-11T21:00:00.000Z',
        kind: 'schedule',
        scheduledFor: '2027-03-11T21:00:00.000Z',
        firedAt: '2027-03-11T21:00:00.000Z',
        isCatchUp: false,
        skipped: [],
        skippedCount: 0,
        ...fire,
      }),
    },
  ]);

  if (record === undefined) {
    throw new Error('the fire wrote no record');
  }

  return record.sequence;
}
