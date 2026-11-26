import type { MeterRead } from '@heynixie/budgets';
import type { TasksContext } from '../types';
import { readRunRecords } from './read-run-records';
import { taskMeterReadCodec } from './task-meter-read-codec';
import type { TaskRun } from './types';

// The reads of the task run, oldest first.
export async function readMeterReads(
  context: Pick<TasksContext, 'log'>,
  run: TaskRun,
): Promise<readonly MeterRead[]> {
  const records = await readRunRecords(context, run, [taskMeterReadCodec.kind]);

  return records.map((record) => {
    const read = taskMeterReadCodec.decode(record.payload);

    return { sandbox: read.sandbox, reason: read.reason, countMicros: read.countMicros };
  });
}
