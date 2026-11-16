import { readRecords } from '@heynixie/log';
import { taskDefinitionSetCodec } from '../task/codec/task-definition-set-codec';
import type { TasksContext } from '../types';
import { readPreviousRun } from './read-previous-run';
import { readRunRows } from './read-run-rows';
import type { TaskRun } from './types';

export interface RunSince {
  // the start of the definition's previous task run, or the time the definition was first enabled
  readonly previousStartedAt: Date;
  readonly startedAt: Date;
}

// The 2 times a definition's task run reads its messages between, or null for a task run that is no
// definition's. A carried task run counts from the start of its piece's first task run, so each
// task run reads from where the previous one's read ended.
export async function readRunSince(
  context: Pick<TasksContext, 'log'>,
  run: TaskRun,
): Promise<RunSince | null> {
  if (run.opened.definitionID === null) {
    return null;
  }

  const runs = await readRunRows(context.log.writer.db, run.taskID);

  const first = findFirstRun(runs, run);

  const previous = await readPreviousRun(context, first);

  const previousStartedAt =
    previous === null
      ? await readFirstEnabledAt(context, run.taskID)
      : findFirstRun(runs, previous).startedAt;

  return previousStartedAt === null ? null : { previousStartedAt, startedAt: first.startedAt };
}

function findFirstRun(runs: readonly TaskRun[], run: TaskRun): TaskRun {
  let first = run;

  while (first.opened.carriesRunID !== null) {
    const carriesRunID = first.opened.carriesRunID;
    const carried = runs.find((candidate) => candidate.runID === carriesRunID);

    if (carried === undefined) {
      return first;
    }

    first = carried;
  }

  return first;
}

const pageSize = 100;

// The first task.definition_set of the task that holds a hash.
async function readFirstEnabledAt(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<Date | null> {
  let afterSequence = 0;

  for (;;) {
    const page = await readRecords(context.log, {
      afterSequence,
      thread: taskID,
      kinds: [taskDefinitionSetCodec.kind],
      limit: pageSize,
    });

    for (const entry of page) {
      if (taskDefinitionSetCodec.decode(entry.record.payload).definitionHash !== null) {
        return entry.record.recordedAt;
      }
    }

    if (page.length < pageSize) {
      return null;
    }

    afterSequence = page.at(-1)?.record.sequence ?? afterSequence;
  }
}
