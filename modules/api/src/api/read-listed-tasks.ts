import { readActionCounts } from '@heynixie/actions';
import type { TaskRunnerResolution, readTaskDirectory } from '@heynixie/tasks';
import {
  pickListedTaskState,
  pickResolvedControls,
  readListedNextRun,
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

export type TaskProfiles = Awaited<ReturnType<typeof readTaskDirectory>>['directory'];

export async function readListedTasks(
  context: APIContext,
  directory: TaskProfiles,
  limit: number,
  taskIDs?: readonly string[],
) {
  const listed = await readTaskList(
    context,
    { directory },
    { callerID: null, limit, ...(taskIDs === undefined ? {} : { taskIDs }) },
  );

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

  const states = listed.map((task) => pickListedTaskState(task));

  const nextRuns = await Promise.all(
    listed.map((task, index) => readListedNextRun(context, task, states[index] ?? task.state)),
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
      disposable: marks[index]?.disposable ?? null,
      isPauseRequested: task.isPauseRequested,
      isPausedByNixie: pausedByNixie.has(task.id),
      isTakingMessages: takers.has(task.id),
      lastActivityAt: task.lastActivityAt,
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

// An unknown stored key lists as it is stored.
function toRunnerKey(resolution: TaskRunnerResolution): string {
  return match(resolution)
    .with({ status: 'found' }, (found) => found.definition.key)
    .with({ status: 'unknown' }, (unknown) => unknown.key)
    .with({ status: 'none' }, () => '')
    .exhaustive();
}
