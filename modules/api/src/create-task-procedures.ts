// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readActionCounts, readTaskActions } from '@heynixie/actions';
import { nixieRunnerControls } from '@heynixie/task-control';
import type { TaskControl, TasksTables } from '@heynixie/tasks';
import {
  readOwnerMessageTakers,
  readTaskDirectory,
  readTaskList,
  waitAtFaultPoint,
} from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { apiImplementer } from './api-implementer';
import { readHeadSequence } from './read-head-sequence';
import { requireCaller } from './require-caller';
import type { APIContext } from './types';
import type { CheckedTaskControlResult } from './write-checked-task-control';
import { writeCheckedTaskControl } from './write-checked-task-control';

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

      return toControlledTask(result, options.errors);
    }),
  };
}

type TaskProfiles = Awaited<ReturnType<typeof readTaskDirectory>>['directory'];

async function readListedTasks(context: APIContext, directory: TaskProfiles, limit: number) {
  const listed = await readTaskList(
    context,
    { directory },
    { callerID: null, state: 'all', limit },
  );

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('task_list.read.after', { kind: 'task', id: null });
  }

  const taskIDs = listed.map((task) => task.id);

  const takers = await readOwnerMessageTakers(context, taskIDs);
  const counts = await readActionCounts(context, taskIDs);

  return listed.map((task) => {
    const actions = counts.get(task.id);

    invariant(actions);

    return {
      actions,
      brief: task.brief,
      controls: [...nixieRunnerControls],
      isPauseRequested: task.isPauseRequested,
      isTakingMessages: takers.has(task.id),
      lastActivityAt: task.lastActivityAt,
      name: task.name,
      state: task.state,
      taskID: task.id,
      waitingOn: task.waitingOn,
    };
  });
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
        .with({ reason: 'not_allowed' }, (refusal) =>
          errors.TASK_STATE_REFUSED({
            data: { isPauseRequested: refusal.isPauseRequested, state: refusal.state },
          }),
        )
        .with({ reason: 'conversation_never_closes' }, () => {
          throw new Error('only a close refuses the conversation');
        })
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
