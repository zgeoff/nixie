import { withWriteTransaction } from '@heynixie/log';
import { pickCarriedLimits } from '../../run/pick-carried-limits';
import { readMeterReads } from '../../run/read-meter-reads';
import { readPieceCounts } from '../../run/read-piece-counts';
import { readRunRows } from '../../run/read-run-rows';
import type { TasksContext } from '../../types';
import type { RaisedSandboxLimit } from './types';

// What the sandbox's limit must hold after the newest raise, from the log as it stands, or null when
// no task run of the task is counted by the gateway.
export async function readRaisedSandboxLimit(
  context: Pick<TasksContext, 'log' | 'runSettings' | 'runners'>,
  taskID: string,
): Promise<RaisedSandboxLimit | null> {
  const db = context.log.writer.db;

  const runs = await readRunRows(db, taskID);

  const last = runs.at(-1);

  if (last?.opened.meter !== 'gateway') {
    return null;
  }

  const reads = await readMeterReads(context, last);

  const newest = reads.at(-1);

  if (newest === undefined) {
    return null;
  }

  const counts = await withWriteTransaction(context.log.writer, (tx) =>
    readPieceCounts(tx, context, runs, last),
  );

  const carried = pickCarriedLimits({
    kind: 'raise',
    first: counts.first,
    raised: counts.raised,
    used: counts.used,
  });

  return {
    sandbox: newest.sandbox,
    countMicros: Math.max(
      ...reads.filter((read) => read.sandbox === newest.sandbox).map((read) => read.countMicros),
    ),
    readCount: reads.length,
    leftDollars: carried.dollars ?? Number.POSITIVE_INFINITY,
  };
}
