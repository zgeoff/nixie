import { claimTask } from '../claim-task';
import { runDueTimers } from '../run-due-timers';
import { runTaskStep } from '../run-task-step';
import type { RunStep, TaskClaim, TasksContext } from '../types';

export interface TaskStepsOptions {
  readonly steps: Readonly<Record<string, RunStep>>;

  readonly advance: (durationMs: number) => void;

  readonly probeDone?: () => Promise<boolean>;

  readonly maxSteps: number;
}

export async function runTaskSteps(
  context: TasksContext,
  options: TaskStepsOptions,
): Promise<number> {
  for (let steps = 0; steps < options.maxSteps; steps += 1) {
    const didRun = await runNextStep(context, options);

    if (!didRun) {
      return steps;
    }

    const isDone = await probeRunDone(options);

    if (isDone) {
      return steps + 1;
    }
  }

  throw new Error(`the tasks ran ${String(options.maxSteps)} steps and still had work`);
}

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

async function runAfterNextTimer(
  context: TasksContext,
  options: TaskStepsOptions,
): Promise<boolean> {
  const dueAt = await readNextTimer(context);

  if (dueAt === null) {
    return false;
  }

  options.advance(Math.max(0, dueAt - context.clock.now()));

  return runNextStep(context, options);
}

async function readNextTimer(context: TasksContext): Promise<number | null> {
  const row = await context.log.writer.db
    .$extendTables<{ timers: { due_at: number; fired_at: number | null } }>()
    .selectFrom('timers')
    .select('due_at')
    .where('fired_at', 'is', null)
    .orderBy('due_at')
    .executeTakeFirst();

  return row?.due_at ?? null;
}

function getTaskStep(options: TaskStepsOptions, claim: TaskClaim): RunStep {
  const step = options.steps[claim.lease.workID];

  if (step === undefined) {
    throw new Error(`the run has no step for the task ${claim.lease.workID}`);
  }

  return step;
}

function probeRunDone(options: TaskStepsOptions): Promise<boolean> {
  return options.probeDone === undefined ? Promise.resolve(false) : options.probeDone();
}
