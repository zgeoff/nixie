// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readActionCounts, readTaskActions } from '@heynixie/actions';
import type { TaskControl, TaskRunnerResolution, TasksTables } from '@heynixie/tasks';
import {
  pickResolvedControls,
  readOwnerMessageTakers,
  readTaskClosedBy,
  readTaskDirectory,
  readTaskList,
  readTaskMark,
  readTasksPausedByNixie,
  waitAtFaultPoint,
} from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import type { CheckedTaskControlResult } from '../kept/write-checked-task-control';
import { writeCheckedTaskControl } from '../kept/write-checked-task-control';
import { writeCheckedTaskMark } from '../kept/write-checked-task-mark';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { readHeadSequence } from '../utils/read-head-sequence';

const listLimit = 100;

export function createTaskProcedures(context: APIContext) {
  const tasks = apiImplementer.tasks;

  return {
    list: tasks.list.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      // The head comes first, so a client that follows the log from it misses no change that the
      // list read below leaves out.
      const readAtSequence = await readHeadSequence(context);

      const messaging = await readTaskDirectory(context, {
        directory: context.settings.taskDirectory,
      });

      const listed = await readListedTasks(context, messaging.directory, listLimit);

      return { tasks: listed, readAtSequence };
    }),

    read: tasks.read.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const messaging = await readTaskDirectory(context, {
        directory: context.settings.taskDirectory,
      });

      const profiles = messaging.directory.filter(
        (profile) => profile.taskID === options.input.taskID,
      );

      const [task] = await readListedTasks(context, profiles, 1);

      if (task === undefined) {
        throw options.errors.TASK_NOT_FOUND();
      }

      return task;
    }),

    readActions: tasks.readActions.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      if (!(await probeTaskExists(context, options.input.taskID))) {
        throw options.errors.TASK_NOT_FOUND();
      }

      const actions = await readTaskActions(context, options.input.taskID);

      return { queued: [...actions.queued], started: [...actions.started] };
    }),

    pause: tasks.pause.handler((options) => runControl(context, 'pause', options)),
    resume: tasks.resume.handler((options) => runControl(context, 'resume', options)),
    stop: tasks.stop.handler((options) => runControl(context, 'stop', options)),
    restart: tasks.restart.handler((options) => runControl(context, 'restart', options)),
    interrupt: tasks.interrupt.handler((options) => runControl(context, 'interrupt', options)),

    setDisposable: tasks.setDisposable.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const result = await writeCheckedTaskMark(context, caller, options.input);

      return match(result)
        .with({ status: 'marked' }, (marked) => ({
          changedAt: new Date(marked.changedAt),
          disposable: marked.disposable,
          taskID: marked.taskID,
        }))
        .with({ status: 'unknown_task' }, () => {
          throw options.errors.TASK_NOT_FOUND();
        })
        .with({ status: 'no_mark' }, () => {
          throw options.errors.TASK_HAS_NO_MARK();
        })
        .with({ status: 'state_refused' }, (refused) => {
          throw options.errors.TASK_STATE_REFUSED({ data: { state: refused.state } });
        })
        .with({ status: 'reused' }, () => {
          throw options.errors.CLIENT_ACTION_ID_REUSED();
        })
        .with({ status: 'unauthorized' }, () => {
          throw options.errors.UNAUTHORIZED();
        })
        .exhaustive();
    }),

    close: tasks.close.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const result = await writeCheckedTaskControl(context, caller, {
        ...options.input,
        control: 'close',
      });

      if (result.status === 'refused' && result.refusal.reason === 'conversation_never_closes') {
        throw options.errors.CONVERSATION_NEVER_CLOSES();
      }

      if (result.status === 'refused' && result.refusal.reason === 'definition_task_never_closes') {
        throw options.errors.DEFINITION_TASK_NEVER_CLOSES();
      }

      return toControlledTask(result, options.errors);
    }),
  };
}

type TaskProfiles = Awaited<ReturnType<typeof readTaskDirectory>>['directory'];

async function readListedTasks(context: APIContext, directory: TaskProfiles, limit: number) {
  const listed = await readTaskList(context, { directory }, { callerID: null, limit });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('task_list.read.after', { kind: 'task', id: null });
  }

  const taskIDs = listed.map((task) => task.id);

  const takers = await readOwnerMessageTakers(context, taskIDs);
  const counts = await readActionCounts(context, taskIDs);
  const pausedByNixie = await readTasksPausedByNixie(context.log.writer.db, taskIDs);

  const runners = await Promise.all(
    taskIDs.map((taskID) => context.runners.resolve(context, taskID)),
  );

  const marks = await Promise.all(
    taskIDs.map((taskID) => readTaskMark(context.log.writer.db, taskID)),
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
      runner: toRunnerKey(runner),
      state: task.state,
      taskID: task.id,
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

async function probeTaskExists(context: APIContext, taskID: string): Promise<boolean> {
  const task = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('task_id')
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  return task !== undefined;
}

type ControlProcedure = Parameters<typeof apiImplementer.tasks.pause.handler>[0];

type ControlOptions = Parameters<ControlProcedure>[0];

async function runControl(context: APIContext, control: TaskControl, options: ControlOptions) {
  const caller = await requireCaller(
    context,
    options.context.sessionToken,
    options.errors.UNAUTHORIZED,
  );

  const result = await writeCheckedTaskControl(context, caller, { ...options.input, control });

  return toControlledTask(result, options.errors);
}

function toControlledTask(result: CheckedTaskControlResult, errors: ControlOptions['errors']) {
  return match(result)
    .with({ status: 'controlled' }, (controlled) => ({
      controlledAt: new Date(controlled.controlledAt),
      isPauseRequested: controlled.isPauseRequested,
      state: controlled.state,
      taskID: controlled.taskID,
    }))
    .with({ status: 'refused' }, (refused) => {
      throw match(refused.refusal)
        .with({ reason: 'unknown_task' }, () => errors.TASK_NOT_FOUND())
        .with({ reason: 'not_allowed' }, { reason: 'at_limit' }, (refusal) =>
          errors.TASK_STATE_REFUSED({
            data: { isPauseRequested: refusal.isPauseRequested, state: refusal.state },
          }),
        )
        .with({ reason: 'runner_lacks_control' }, () => errors.RUNNER_LACKS_CONTROL())
        .with(
          { reason: 'conversation_never_closes' },
          { reason: 'definition_task_never_closes' },
          () => {
            throw new Error('only a close refuses the conversation or a definition task');
          },
        )
        .exhaustive();
    })
    .with({ status: 'reused' }, () => {
      throw errors.CLIENT_ACTION_ID_REUSED();
    })
    .with({ status: 'unauthorized' }, () => {
      throw errors.UNAUTHORIZED();
    })
    .exhaustive();
}
