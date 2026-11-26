// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { toErrorFields } from '@heynixie/logger';
import { patchLimitUntilSet, pickSandboxLimit } from '@heynixie/spend';
import type { RaisedSandboxLimit, TaskControl } from '@heynixie/tasks';
import {
  readRaisedSandboxLimit,
  writeTaskControl,
  writeTaskLimitRaise,
  writeTaskResume,
} from '@heynixie/tasks';
import { match } from 'ts-pattern';
import { readResumeRefusal } from '../spend/read-resume-refusal';
import type { APIContext } from '../types';
import { hostImplementer } from './host-implementer';

export function createHostTaskProcedures(context: APIContext) {
  const tasks = hostImplementer.tasks;

  return {
    pause: tasks.pause.handler((options) => runHostControl(context, 'pause', options)),
    resume: tasks.resume.handler(async (options) => {
      const refusal = await readResumeRefusal(context);

      if (refusal !== null) {
        throw options.errors.SPEND_STOP_STANDS({ message: refusal });
      }

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
        .with({ status: 'raised' }, (raised) => {
          startRaisedLimitPatch(context, taskID, raised.sandboxLimit);

          return {
            taskID,
            state: raised.state,
            isPauseRequested: raised.isPauseRequested,
            turns: raised.limits.turns,
            dollars: raised.limits.dollars,
          };
        })
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

      if (
        outcome.status === 'refused' &&
        outcome.refusal.reason === 'definition_task_never_closes'
      ) {
        throw options.errors.DEFINITION_TASK_NEVER_CLOSES();
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
    .with({ reason: 'runner_lacks_control' }, () =>
      errors.RUNNER_LACKS_CONTROL({
        message: `the runner of task ${taskID} does not take this control`,
      }),
    )
    .with(
      { reason: 'conversation_never_closes' },
      { reason: 'definition_task_never_closes' },
      () => {
        throw new Error('only a close refuses the conversation or a definition task');
      },
    )
    .exhaustive();
}

// The raise has committed. The sandbox's limit follows it off the call that raised, and goes again
// until the gateway takes it, because a raise the gateway cannot hear still resumes the task, and the
// next task run's start sets the limit too.
function startRaisedLimitPatch(
  context: APIContext,
  taskID: string,
  sandboxLimit: RaisedSandboxLimit | null,
): void {
  if (sandboxLimit === null || context.spend === undefined) {
    return;
  }

  void runRaisedLimitPatch(context, context.spend, sandboxLimit, taskID);
}

const raisedLimitRetryMs = 5000;

async function runRaisedLimitPatch(
  context: APIContext,
  spend: NonNullable<APIContext['spend']>,
  raised: RaisedSandboxLimit,
  taskID: string,
): Promise<void> {
  const logger = context.logger ?? (() => {});

  // A step that began after the raise reads a newer count, and sets the limit itself from the same
  // log, so this patch goes only while no newer read exists.
  const readLimit = async () => {
    const current = await readRaisedSandboxLimit(context, taskID);

    if (
      current === null ||
      current.sandbox !== raised.sandbox ||
      current.readCount !== raised.readCount
    ) {
      return null;
    }

    return {
      limit: pickSandboxLimit({
        startMicros: current.countMicros,
        leftDollars: current.leftDollars,
      }),
    };
  };

  try {
    await patchLimitUntilSet(
      spend,
      { sandbox: raised.sandbox, readLimit },
      { retryMs: raisedLimitRetryMs, logger },
    );
  } catch (error) {
    logger('spend.sandbox_limit_patch_failed', toErrorFields(error), 'error');
  }
}
