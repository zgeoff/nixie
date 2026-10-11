import type { RunnerPool, TasksContext } from '@heynixie/tasks';
import { startRunnerPool } from '@heynixie/tasks';
import { claimAction } from './claim-action';
import { runActionAttempt } from './run-action-attempt';
import type { ActionConnector } from './types';

export interface ActionRunnersOptions {
  readonly connectors: ReadonlyMap<string, ActionConnector>;
  readonly onError: (error: unknown) => void;

  // 4 actions at once by default, apart from the task runners, so a send goes out while every
  // task runner is busy with a long turn
  readonly size?: number;
  readonly holder?: string;
  readonly leaseMs?: number;
  readonly pollMs?: number;
}

// Starts the action runners: a pool that claims each due action through the same claim path as a
// task step, and runs one attempt of it per claim.
export function startActionRunners(
  context: TasksContext,
  options: ActionRunnersOptions,
): RunnerPool {
  const holder = options.holder ?? crypto.randomUUID();
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;

  return startRunnerPool(context.clock, {
    size: options.size ?? DEFAULT_SIZE,
    pollMs: options.pollMs ?? DEFAULT_POLL_MS,
    claim: () => claimAction(context, { holder, leaseMs }),
    run: (lease) => runActionAttempt(context, lease, { connectors: options.connectors, leaseMs }),
    onError: options.onError,
  });
}

const DEFAULT_SIZE = 4;
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_POLL_MS = 1000;
