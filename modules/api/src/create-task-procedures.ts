// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { TaskControl } from '@heynixie/tasks';
import { readOwnerMessageTakers, readTaskDirectory, readTaskList } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import { apiImplementer } from './api-implementer';
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

      const directory = await readTaskDirectory(context, {
        directory: context.settings.taskDirectory,
      });

      const listed = await readTaskList(context, directory, {
        callerID: null,
        state: 'all',
        limit: listLimit,
      });

      const takers = await readOwnerMessageTakers(
        context,
        listed.map((task) => task.id),
      );

      return {
        tasks: listed.map((task) => ({
          brief: task.brief,
          isPauseRequested: task.isPauseRequested,
          isTakingMessages: takers.has(task.id),
          lastActivityAt: task.lastActivityAt,
          name: task.name,
          state: task.state,
          taskID: task.id,
        })),
      };
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
