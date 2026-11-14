import type { LogRecord, RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '../types';
import { pickRecordRun } from './pick-record-run';
import { readRunRows } from './read-run-rows';
import type { TaskRun } from './types';

const pageSize = 500;

// The only reader that applies pickRecordRun. A record that lands after its task run ended can
// carry the task run's ID, so the read goes to the newest record of the task.
export async function readRunRecords(
  context: Pick<TasksContext, 'log'>,
  run: TaskRun,
  kinds: readonly RecordKind[],
): Promise<readonly LogRecord[]> {
  const runs = await readRunRows(context.log.writer.db, run.taskID);

  // The waking input that opened the task run sits before the claim that opened it.
  const firstSequence = Math.min(run.openedSequence, run.opened.origin.sequence ?? Infinity);
  const records: LogRecord[] = [];
  let afterSequence = firstSequence - 1;
  let isLastPage = false;

  while (!isLastPage) {
    const page = await readRecords(context.log, {
      afterSequence,
      thread: run.taskID,
      kinds,
      limit: pageSize,
    });

    for (const entry of page) {
      const taskRunID = readTaskRunID(entry.record);

      if (
        pickRecordRun({ sequence: entry.record.sequence, taskRunID }, runs)?.runID === run.runID
      ) {
        records.push(entry.record);
      }
    }

    afterSequence = page.at(-1)?.record.sequence ?? afterSequence;
    isLastPage = page.length < pageSize;
  }

  return records;
}

function readTaskRunID(record: LogRecord): string | undefined {
  const taskRunID = record.payload['taskRunID'];

  return typeof taskRunID === 'string' ? taskRunID : undefined;
}
