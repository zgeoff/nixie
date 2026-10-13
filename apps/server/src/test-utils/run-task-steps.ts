import type { RunStep, TaskClaim, TasksContext } from '@heynixie/tasks';
import { claimTask, runDueTimers, runTaskStep } from '@heynixie/tasks';

export interface TaskStepsOptions {
  // the step of each task the run drives, by task ID
  readonly steps: Readonly<Record<string, RunStep>>;

  // moves the context's test clock forward, so the next timer falls due without a sleep
  readonly advance: (ms: number) => void;

  // checked after each step: true ends the run before the tasks settle
  readonly isDone?: () => Promise<boolean>;

  // the most steps the run takes before it throws, so a task that never settles fails the test
  readonly maxSteps: number;
}

// Runs task steps the way a runner does, firing each due timer first and moving the clock to the
// next timer when no task has work, until no timer is left or isDone holds. It returns how many
// steps ran, and throws on a claimed task it has no step for.
export async function runTaskSteps(
  context: TasksContext,
  options: TaskStepsOptions,
): Promise<number> {
  for (let steps = 0; steps < options.maxSteps; steps += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each step sees what the step before it wrote
    const didRun = await runNextStep(context, options);

    if (!didRun) {
      return steps;
    }

    // oxlint-disable-next-line no-await-in-loop -- the check reads what the step wrote
    const isDone = await isRunDone(options);

    if (isDone) {
      return steps + 1;
    }
  }
  throw new Error(`the tasks ran ${String(options.maxSteps)} steps and still had work`);
}

// runs the next step, after moving the clock to the next timer when no task has work, or returns
// false when no task has work and no timer is left
async function runNextStep(context: TasksContext, options: TaskStepsOptions): Promise<boolean> {
  await runDueTimers(context);

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    return runAfterNextTimer(context, options);
  }
  await runTaskStep(context, claim, {
    runStep: getTaskStep(options, claim),
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });
  return true;
}

function getTaskStep(options: TaskStepsOptions, claim: TaskClaim): RunStep {
  const step = options.steps[claim.lease.workID];

  if (step === undefined) {
    throw new Error(`the run has no step for the task ${claim.lease.workID}`);
  }
  return step;
}

async function runAfterNextTimer(
  context: TasksContext,
  options: TaskStepsOptions,
): Promise<boolean> {
  const dueAt = await findNextTimer(context);

  if (dueAt === null) {
    return false;
  }
  options.advance(Math.max(0, dueAt - context.clock.now()));
  return runNextStep(context, options);
}

function isRunDone(options: TaskStepsOptions): Promise<boolean> {
  return options.isDone === undefined ? Promise.resolve(false) : options.isDone();
}

async function findNextTimer(context: TasksContext): Promise<number | null> {
  const row = await context.log.writer.db
    .$extendTables<{ timers: { due_at: number; fired_at: number | null } }>()
    .selectFrom('timers')
    .select('due_at')
    .where('fired_at', 'is', null)
    .orderBy('due_at')
    .executeTakeFirst();

  return row?.due_at ?? null;
}
