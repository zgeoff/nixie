import type { TasksContext } from '../types';
import { collectUnsettledSandboxes } from './collect-unsettled-sandboxes';
import { readMeterReads } from './read-meter-reads';
import { readOpenRun } from './read-open-run';
import { writeMeterRead } from './write-meter-read';

// 'settled': every sandbox that the task's open task run read has its end read, or no task run is
// open. 'waiting': the gateway did not answer a read, so the task run must not end yet.
export type RunEndSettlement = 'settled' | 'waiting';

// Writes the end read of each sandbox that the open task run read and that has none. A sandbox that
// the gateway no longer holds keeps its last count, because no later spend can land on it.
export async function settleRunEnd(
  context: Pick<TasksContext, 'definitions' | 'log' | 'runSettings'>,
  taskID: string,
): Promise<RunEndSettlement> {
  const run = await readOpenRun(context.log.writer.db, taskID);

  if (run === null) {
    return 'settled';
  }

  const reads = await readMeterReads(context, run);

  let settlement: RunEndSettlement = 'settled';

  for (const unsettled of collectUnsettledSandboxes(reads, taskID)) {
    const answer = unsettled.isTally
      ? ({ kind: 'ok', micros: unsettled.lastMicros } as const)
      : await context.runSettings.readSandboxMicros(unsettled.sandbox);

    if (answer.kind === 'unreachable') {
      settlement = 'waiting';
    } else {
      await writeMeterRead(context, {
        taskID,
        taskRunID: run.runID,
        sandbox: unsettled.sandbox,
        reason: 'run_end',
        countMicros:
          answer.kind === 'ok'
            ? Math.max(unsettled.lastMicros, answer.micros)
            : unsettled.lastMicros,
      });
    }
  }

  return settlement;
}
