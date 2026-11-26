import { toMicrosUp } from '@heynixie/budgets';
import type { Logger } from '@heynixie/logger';
import type { SpendGateway } from '@heynixie/spend';
import type { TasksContext } from '@heynixie/tasks';
import { readEndedRuns, readMeterReads, readOpenRun, writeMeterRead } from '@heynixie/tasks';

export interface RunEndDeps {
  readonly context: TasksContext;
  readonly gateway: SpendGateway | undefined;
  readonly logger: Logger;
}

// 'settled': the newest ended task run of the task has its end read, or needs none, or a newer task
// run is open, whose reads count its own spend. 'waiting': the
// gateway did not answer a read, so the task run is not closed and its sandbox keeps its count.
export type RunEndSettlement = 'settled' | 'waiting';

// Writes the end read of the task's newest ended task run, for each sandbox that it read and that
// has none yet. A sandbox that the gateway no longer holds has no count to read. A task run that
// began before its start record named a meter has no reads.
export async function settleRunEnd(deps: RunEndDeps, taskID: string): Promise<RunEndSettlement> {
  const open = await readOpenRun(deps.context.log.writer.db, taskID);
  const [run] = await readEndedRuns(deps.context, { taskID, limit: 1 });

  if (open !== null || run?.opened.meter === undefined) {
    return 'settled';
  }

  const reads = await readMeterReads(deps.context, run);

  const ended = new Set(
    reads.filter((read) => read.reason === 'run_end').map((read) => read.sandbox),
  );

  const unended = [...new Set(reads.map((read) => read.sandbox))].filter(
    (name) => !ended.has(name),
  );

  let settlement: RunEndSettlement = 'settled';

  for (const sandbox of unended) {
    const countMicros = await readEndCount(deps, {
      meter: run.opened.meter,
      taskID,
      sandbox,
      lastMicros: Math.max(
        ...reads.filter((read) => read.sandbox === sandbox).map((read) => read.countMicros),
      ),
    });

    if (countMicros === 'unreachable') {
      settlement = 'waiting';
    } else if (countMicros !== 'gone') {
      await writeMeterRead(deps.context, {
        taskID,
        taskRunID: run.runID,
        sandbox,
        reason: 'run_end',
        countMicros,
      });
    }
  }

  return settlement;
}

interface EndCountFacts {
  readonly meter: 'gateway' | 'records';
  readonly taskID: string;
  readonly sandbox: string;
  readonly lastMicros: number;
}

// The count to write, 'gone' for a sandbox the gateway no longer holds, or 'unreachable'.
async function readEndCount(
  deps: RunEndDeps,
  facts: EndCountFacts,
): Promise<number | 'gone' | 'unreachable'> {
  if (facts.meter === 'records' || deps.gateway === undefined) {
    return facts.lastMicros;
  }

  const read = await deps.gateway.readSandbox(facts.sandbox);

  if (read.kind === 'ok') {
    return toMicrosUp(read.value.dollars);
  }

  if (read.kind === 'not_found') {
    return 'gone';
  }

  deps.logger(
    'task.meter_read_failed',
    { taskID: facts.taskID, sandboxID: facts.sandbox, reason: 'run_end', outcome: read.kind },
    'warn',
  );

  return 'unreachable';
}
