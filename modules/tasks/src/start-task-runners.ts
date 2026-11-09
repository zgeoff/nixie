import { subscribeToRecordCommits } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { ClaimTaskOptions } from './claim-task';
import { claimTask } from './claim-task';
import { DEFAULT_MAX_STEP_ERRORS } from './default-max-step-errors';
import { runDueTimers } from './run-due-timers';
import { runTaskStep } from './run-task-step';
import type { RunnerPool } from './start-runner-pool';
import { startRunnerPool } from './start-runner-pool';
import type { RunStep, StepErrored, TasksContext } from './types';

interface StartedTaskPool {
  readonly runStep: RunStep;
  readonly size: number;
}

export interface TaskRunnersOptions {
  readonly runStep: RunStep;

  readonly started?: StartedTaskPool;

  readonly onStepErrored: (errored: StepErrored) => void;
  readonly onError: (error: unknown) => void;
  readonly logger: Logger;

  readonly size?: number;
  readonly holder?: string;
  readonly leaseMs?: number;
  readonly pollMs?: number;
  readonly maxStepErrors?: number;
  readonly retryDelayMs?: number;
  readonly maxRetryDelayMs?: number;
}

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_POLL_MS = 1000;
const DEFAULT_RETRY_DELAY_MS = 30_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 300_000;

interface StepPool {
  readonly runStep: RunStep;
  readonly size: number;
  readonly claimed: Pick<ClaimTaskOptions, 'tasks'>;
}

export function startTaskRunners(context: TasksContext, options: TaskRunnersOptions): RunnerPool {
  const holder = options.holder ?? crypto.randomUUID();
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;

  const startStepPool = (pool: StepPool) =>
    startRunnerPool(context.clock, {
      size: pool.size,
      pollMs,
      claim: () => claimTask(context, { holder, leaseMs, ...pool.claimed }),
      run: async (claim) => {
        const errored = await runTaskStep(context, claim, {
          runStep: pool.runStep,
          leaseMs,
          logger: options.logger,
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

  const steps = buildStepPools(options).map((pool) => startStepPool(pool));

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

  const pools = [...steps, timers];

  const wake = () => {
    for (const pool of pools) {
      pool.wake();
    }
  };

  // A record can make a task claimable, such as a message landing in its inbox, so an idle runner
  // claims at once instead of after its poll.
  const unsubscribe = subscribeToRecordCommits(context.log.writer, wake);

  return {
    wake,
    stop: async (graceMs) => {
      unsubscribe();

      await Promise.all(pools.map((pool) => pool.stop(graceMs)));
    },
  };
}

const DEFAULT_SIZE = 3;

// Started tasks claim through a pool of their own, so long steps of theirs never hold every claim
// loop while the conversation waits.
function buildStepPools(options: TaskRunnersOptions): readonly StepPool[] {
  const size = options.size ?? DEFAULT_SIZE;

  if (options.started === undefined) {
    return [{ runStep: options.runStep, size, claimed: {} }];
  }

  return [
    { runStep: options.runStep, size, claimed: { tasks: 'unstarted' } },
    { runStep: options.started.runStep, size: options.started.size, claimed: { tasks: 'started' } },
  ];
}
