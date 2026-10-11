import { claimTask } from './claim-task';
import { runDueTimers } from './run-due-timers';
import { runTaskStep } from './run-task-step';
import type { RunnerPool } from './start-runner-pool';
import { startRunnerPool } from './start-runner-pool';
import type { RunStep, TasksContext } from './types';

export interface TaskRunnersOptions {
  readonly runStep: RunStep;
  readonly onError: (error: unknown) => void;

  // 3 steps at once by default, the limit on concurrent work in tier 2
  readonly size?: number;
  readonly holder?: string;
  readonly leaseMs?: number;
  readonly pollMs?: number;
  readonly maxStepErrors?: number;
  readonly retryDelayMs?: number;
}

// Starts the task runners: a pool that claims and runs one step per runner, beside a runner that
// fires due timers on each poll.
export function startTaskRunners(context: TasksContext, options: TaskRunnersOptions): RunnerPool {
  const holder = options.holder ?? crypto.randomUUID();
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const steps = startRunnerPool(context.clock, {
    size: options.size ?? DEFAULT_SIZE,
    pollMs,
    claim: () => claimTask(context, { holder, leaseMs }),
    run: (claim) =>
      runTaskStep(context, claim, {
        runStep: options.runStep,
        leaseMs,
        maxStepErrors: options.maxStepErrors ?? DEFAULT_MAX_STEP_ERRORS,
        retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      }),
    onError: options.onError,
  });

  // its claim fires the due timers and hands back no work, so it only ever polls
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

const DEFAULT_SIZE = 3;

// Why: a lease of 60 s renewed every 20 s survives 2 missed renewals, and a dead runner frees its
// task within a minute.
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_POLL_MS = 1000;
const DEFAULT_MAX_STEP_ERRORS = 3;
const DEFAULT_RETRY_DELAY_MS = 30_000;
