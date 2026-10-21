import { claimTask } from './claim-task';
import { DEFAULT_MAX_STEP_ERRORS } from './default-max-step-errors';
import { runDueTimers } from './run-due-timers';
import { runTaskStep } from './run-task-step';
import type { RunnerPool } from './start-runner-pool';
import { startRunnerPool } from './start-runner-pool';
import type { RunStep, StepErrored, TasksContext } from './types';

export interface TaskRunnersOptions {
  readonly runStep: RunStep;

  readonly onStepErrored: (errored: StepErrored) => void;
  readonly onError: (error: unknown) => void;

  readonly size?: number;
  readonly holder?: string;
  readonly leaseMs?: number;
  readonly pollMs?: number;
  readonly maxStepErrors?: number;
  readonly retryDelayMs?: number;
  readonly maxRetryDelayMs?: number;
}

const DEFAULT_SIZE = 3;
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_POLL_MS = 1000;
const DEFAULT_RETRY_DELAY_MS = 30_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 300_000;

export function startTaskRunners(context: TasksContext, options: TaskRunnersOptions): RunnerPool {
  const holder = options.holder ?? crypto.randomUUID();
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;

  const steps = startRunnerPool(context.clock, {
    size: options.size ?? DEFAULT_SIZE,
    pollMs,
    claim: () => claimTask(context, { holder, leaseMs }),
    run: async (claim) => {
      const errored = await runTaskStep(context, claim, {
        runStep: options.runStep,
        leaseMs,
        maxStepErrors: options.maxStepErrors ?? DEFAULT_MAX_STEP_ERRORS,
        retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
        maxRetryDelayMs: options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
      });

      if (errored !== null) {
        options.onStepErrored(errored);
      }
    },
    onError: options.onError,
  });

  const timers = startRunnerPool<never>(context.clock, {
    size: 1,
    pollMs,
    claim: async () => {
      await runDueTimers(context);

      return null;
    },
    run: async () => {},
    onError: options.onError,
  });

  return {
    wake: () => {
      steps.wake();
      timers.wake();
    },
    stop: async (graceMs) => {
      await Promise.all([steps.stop(graceMs), timers.stop(graceMs)]);
    },
  };
}
