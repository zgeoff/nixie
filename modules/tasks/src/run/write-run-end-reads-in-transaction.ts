import type { Transaction } from 'kysely';
import type { TasksContext } from '../types';
import { collectUnsettledSandboxes } from './collect-unsettled-sandboxes';
import { readMeterReads } from './read-meter-reads';
import { RunEndUnsettledError } from './run-end-unsettled-error';
import { settledSandboxes } from './settled-sandboxes';
import { toTransactionContext } from './to-transaction-context';
import type { TaskRun } from './types';
import { writeMeterReadInTransaction } from './write-meter-read-in-transaction';

// A task run ends only once each sandbox it read has its read at the end. The runner's own tally has
// no gateway to ask, so its end read goes in with the end. A sandbox that the gateway counts needs a
// read outside the transaction, so the end throws for the caller to read it and end again.
export async function writeRunEndReadsInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'definitions' | 'log'>,
  run: TaskRun,
): Promise<void> {
  const reads = await readMeterReads(toTransactionContext(context, tx), run);

  const unsettled = collectUnsettledSandboxes(reads, run.taskID, settledSandboxes.getStore());

  if (unsettled.some((sandbox) => !sandbox.isTally)) {
    throw new RunEndUnsettledError(run.taskID, run.runID);
  }

  for (const sandbox of unsettled) {
    await writeMeterReadInTransaction(tx, context, {
      taskID: run.taskID,
      taskRunID: run.runID,
      sandbox: sandbox.sandbox,
      reason: 'run_end',
      countMicros: sandbox.lastMicros,
    });
  }
}
