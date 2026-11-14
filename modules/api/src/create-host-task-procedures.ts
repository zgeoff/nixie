// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { TaskControl } from '@heynixie/tasks';
import { writeTaskControl, writeTaskLimitRaise, writeTaskResume } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import { hostImplementer } from './host-implementer';
import type { APIContext } from './types';

export function createHostTaskProcedures(context: APIContext) {
  const tasks = hostImplementer.tasks;

  return {
    pause: tasks.pause.handler((options) => runHostControl(context, 'pause', options)),
    resume: tasks.resume.handler(async (options) => {
      const outcome = await writeTaskResume(context, { taskID: options.input.taskID, by: 'host' });

      return toHostControlled(options.input.taskID, outcome, options.errors);
    }),
    stop: tasks.stop.handler((options) => runHostControl(context, 'stop', options)),
    restart: tasks.restart.handler((options) => runHostControl(context, 'restart', options)),
    interrupt: tasks.interrupt.handler((options) => runHostControl(context, 'interrupt', options)),

    raise: tasks.raise.handler(async (options) => {
      const { taskID, ...limits } = options.input;

      const outcome = await writeTaskLimitRaise(context, { taskID, limits });

      return match(outcome)
        .with({ status: 'raised' }, (raised) => ({
          taskID,
          state: raised.state,
          isPauseRequested: raised.isPauseRequested,
          turns: raised.limits.turns,
          dollars: raised.limits.dollars,
        }))
        .with({ reason: 'unknown_task' }, () => {
          throw options.errors.TASK_NOT_FOUND();
        })
        .with({ reason: 'not_held' }, () => {
          throw options.errors.TASK_NOT_AT_LIMIT();
        })
        .with({ reason: 'not_raised' }, () => {
          throw options.errors.LIMIT_NOT_RAISED();
        })
        .exhaustive();
    }),

    close: tasks.close.handler(async (options) => {
      const outcome = await writeTaskControl(context, {
        taskID: options.input.taskID,
        control: 'close',
      });

      if (outcome.status === 'refused' && outcome.refusal.reason === 'conversation_never_closes') {
        throw options.errors.CONVERSATION_NEVER_CLOSES();
      }

      return toHostControlled(options.input.taskID, outcome, options.errors);
    }),
  };
}

type HostControlProcedure = Parameters<typeof hostImplementer.tasks.pause.handler>[0];

type HostControlOptions = Parameters<HostControlProcedure>[0];

async function runHostControl(
  context: APIContext,
  control: TaskControl,
  options: HostControlOptions,
) {
  const outcome = await writeTaskControl(context, { taskID: options.input.taskID, control });

  return toHostControlled(options.input.taskID, outcome, options.errors);
}

type ControlOutcome = Awaited<ReturnType<typeof writeTaskControl>>;

function toHostControlled(
  taskID: string,
  outcome: ControlOutcome,
  errors: HostControlOptions['errors'],
) {
  if (outcome.status === 'controlled') {
    return { taskID, state: outcome.state, isPauseRequested: outcome.isPauseRequested };
  }

  throw match(outcome.refusal)
    .with({ reason: 'unknown_task' }, () => errors.TASK_NOT_FOUND())
    .with({ reason: 'not_allowed' }, (refusal) =>
      errors.TASK_STATE_REFUSED({
        message: `task ${taskID} is ${refusal.isPauseRequested ? 'running with a pause asked' : refusal.state}, which does not take this control`,
      }),
    )
    .with({ reason: 'at_limit' }, () =>
      errors.TASK_STATE_REFUSED({
        message: `task ${taskID} reached its limit, and only a raise of the limit resumes it`,
      }),
    )
    .with({ reason: 'conversation_never_closes' }, () => {
      throw new Error('only a close refuses the conversation');
    })
    .exhaustive();
}
