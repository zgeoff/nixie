import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TaskRun, TasksContext } from '@heynixie/tasks';
import { taskFailedTurnSpentCodec } from '@heynixie/tasks';
import { workerRunStartedCodec } from '../worker/worker-run-started-codec';
import { workerTurnEndedCodec } from '../worker/worker-turn-ended-codec';

// Only the spend that names this task run counts, because another task run's spend never shortens
// this one's turn. The workers that the reading step started count through its budget, so their
// records stay out of this read.
export async function readLateSpend(
  context: Pick<TasksContext, 'log'>,
  run: TaskRun,
  afterSequence: number,
  stepRunID: string,
): Promise<number> {
  const records = await readLateRecords(context, run, afterSequence);

  const workerRunIDs = collectWorkerRunIDs(records, run);

  const ownWorkerRunIDs =
    workerRunIDs.size === 0
      ? new Set<string>()
      : await readOwnWorkerRunIDs(context, run, stepRunID);

  let dollars = 0;

  for (const record of records) {
    if (record.kind === taskFailedTurnSpentCodec.kind) {
      const spent = taskFailedTurnSpentCodec.decode(record.payload);

      dollars += spent.taskRunID === run.runID ? spent.dollars : 0;
    } else {
      const turn = workerTurnEndedCodec.decode(record.payload);

      dollars +=
        turn.taskRunID === run.runID && !ownWorkerRunIDs.has(turn.workerRunID) ? turn.dollars : 0;
    }
  }

  return dollars;
}

const pageSize = 500;

async function readLateRecords(
  context: Pick<TasksContext, 'log'>,
  run: TaskRun,
  afterSequence: number,
): Promise<readonly LogRecord[]> {
  const records: LogRecord[] = [];
  let cursor = afterSequence;
  let isLastPage = false;

  // One read serves the normal case. The loop only keeps a long backlog from undercounting.
  while (!isLastPage) {
    const page = await readRecords(context.log, {
      afterSequence: cursor,
      thread: run.taskID,
      kinds: [taskFailedTurnSpentCodec.kind, workerTurnEndedCodec.kind],
      limit: pageSize,
    });

    records.push(...page.map((entry) => entry.record));

    cursor = page.at(-1)?.record.sequence ?? cursor;
    isLastPage = page.length < pageSize;
  }

  return records;
}

function collectWorkerRunIDs(records: readonly LogRecord[], run: TaskRun): ReadonlySet<string> {
  return new Set(
    records
      .filter((record) => record.kind === workerTurnEndedCodec.kind)
      .map((record) => workerTurnEndedCodec.decode(record.payload))
      .filter((turn) => turn.taskRunID === run.runID)
      .map((turn) => turn.workerRunID),
  );
}

// A worker's start record can sit before the sequence the late read begins at, so the read goes back
// to the task run's own start.
async function readOwnWorkerRunIDs(
  context: Pick<TasksContext, 'log'>,
  run: TaskRun,
  stepRunID: string,
): Promise<ReadonlySet<string>> {
  const own = new Set<string>();

  let cursor = run.openedSequence - 1;
  let isLastPage = false;

  while (!isLastPage) {
    const page = await readRecords(context.log, {
      afterSequence: cursor,
      thread: run.taskID,
      kinds: [workerRunStartedCodec.kind],
      limit: pageSize,
    });

    for (const entry of page) {
      const started = workerRunStartedCodec.decode(entry.record.payload);

      if (started.stepRunID === stepRunID) {
        own.add(started.workerRunID);
      }
    }

    cursor = page.at(-1)?.record.sequence ?? cursor;
    isLastPage = page.length < pageSize;
  }

  return own;
}
