import { readActionCounts } from '@heynixie/actions';
import type { ListedTaskState, TaskRunnerResolution, readTaskDirectory } from '@heynixie/tasks';
import {
  pickListedTaskState,
  pickResolvedControls,
  readListedNextRun,
  readNewestRun,
  readOpenRun,
  readOwnerMessageTakers,
  readTaskClosedBy,
  readTaskList,
  readTaskMark,
  readTasksPausedByNixie,
  waitAtFaultPoint,
} from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import type { APIContext } from '../types';
import { pickShownTaskState } from './pick-shown-task-state';
import { readTaskRunFire } from './read-task-run-fire';

export type TaskProfiles = Awaited<ReturnType<typeof readTaskDirectory>>['directory'];

export interface ListedTaskFilter {
  readonly taskIDs?: readonly string[] | undefined;
  readonly definitionID?: string | undefined;
  readonly states?: readonly ListedTaskState[] | undefined;
}

export async function readListedTasks(
  context: APIContext,
  directory: TaskProfiles,
  limit: number,
  filter: ListedTaskFilter = {},
) {
  const states = filter.states;
  const taskIDs = filter.taskIDs;

  // A listed state exists only after the read, so a state filter reads every task, keeps the
  // matches and then cuts to the limit.
  const read = await readTaskList(
    context,
    { directory },
    {
      callerID: null,
      ...(states === undefined ? { limit } : {}),
      ...(taskIDs === undefined ? {} : { taskIDs }),
      ...(filter.definitionID === undefined ? {} : { definitionID: filter.definitionID }),
    },
  );

  const listed =
    states === undefined
      ? read
      : await keepStates(context, read, states).then((kept) => kept.slice(0, limit));

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('task_list.read.after', { kind: 'task', id: null });
  }

  const listedIDs = listed.map((task) => task.id);

  const takers = await readOwnerMessageTakers(context, listedIDs);
  const counts = await readActionCounts(context, listedIDs);
  const pausedByNixie = await readTasksPausedByNixie(context.log.writer.db, listedIDs);

  const runners = await Promise.all(
    listedIDs.map((taskID) => context.runners.resolve(context, taskID)),
  );

  const marks = await Promise.all(
    listedIDs.map((taskID) => readTaskMark(context.log.writer.db, taskID)),
  );

  const ownStates = listed.map((task) => pickListedTaskState(task));

  const nextRuns = await Promise.all(
    listed.map((task, index) => readListedNextRun(context, task, ownStates[index] ?? task.state)),
  );

  const fires = await Promise.all(
    listed.map((task) =>
      task.definitionID === null ? Promise.resolve(undefined) : readTaskFire(context, task.id),
    ),
  );

  const closedTasks = listed.filter((task) => task.state === 'closed');

  const closedByList = await Promise.all(
    closedTasks.map(
      async (task) => [task.id, await readTaskClosedBy(context.log.writer.db, task.id)] as const,
    ),
  );

  const closedByTask = new Map(closedByList);

  return listed.map((task, index) => {
    const actions = counts.get(task.id);
    const runner = runners[index];
    const closedBy = closedByTask.get(task.id);

    invariant(actions);
    invariant(runner);

    return {
      actions,
      brief: task.brief,
      closedBy: closedBy ?? undefined,
      controls: [...pickResolvedControls(runner)],
      definitionID: task.definitionID ?? undefined,
      disposable: marks[index]?.disposable ?? null,
      fire: fires[index],
      isPauseRequested: task.isPauseRequested,
      isPausedByNixie: pausedByNixie.has(task.id),
      isTakingMessages: takers.has(task.id),
      lastActivityAt: task.lastActivityAt,
      listedState: pickShownTaskState(
        task.state,
        ownStates[index] ?? task.state,
        pausedByNixie.has(task.id),
      ),
      name: task.name,
      nextRunAt: nextRuns[index] ?? undefined,
      runner: toRunnerKey(runner),
      state: task.state,
      taskID: task.id,
      wakeable: task.wakeable,
      waitingOn: task.waitingOn,
    };
  });
}

async function keepStates(
  context: APIContext,
  tasks: Awaited<ReturnType<typeof readTaskList>>,
  states: readonly ListedTaskState[],
) {
  const paused = await readTasksPausedByNixie(
    context.log.writer.db,
    tasks.map((task) => task.id),
  );

  return tasks.filter((task) =>
    states.includes(pickShownTaskState(task.state, pickListedTaskState(task), paused.has(task.id))),
  );
}

// The fire of the open task run, else of the newest one. Null when it has no fire or the task has
// no task run.
async function readTaskFire(context: APIContext, taskID: string) {
  const db = context.log.writer.db;

  const open = await readOpenRun(db, taskID);

  if (open !== null) {
    return readTaskRunFire(context, open);
  }

  const newest = await readNewestRun(db, taskID);

  return newest === null ? null : readTaskRunFire(context, newest);
}

// An unknown stored key lists as it is stored.
function toRunnerKey(resolution: TaskRunnerResolution): string {
  return match(resolution)
    .with({ status: 'found' }, (found) => found.definition.key)
    .with({ status: 'unknown' }, (unknown) => unknown.key)
    .with({ status: 'none' }, () => '')
    .exhaustive();
}
