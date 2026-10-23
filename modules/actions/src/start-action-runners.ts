import type { ActionConnector } from '@heynixie/connectors';
import { subscribeToRecordCommits } from '@heynixie/log';
import type { RunnerPool, TasksContext } from '@heynixie/tasks';
import { startRunnerPool } from '@heynixie/tasks';
import { claimAction } from './claim-action';
import { runActionAttempt } from './run-action-attempt';

export interface ActionRunnersOptions {
  readonly connectors: ReadonlyMap<string, ActionConnector>;
  readonly onError: (error: unknown) => void;

  readonly size?: number;
  readonly holder?: string;
  readonly leaseMs?: number;
  readonly pollMs?: number;
}

const DEFAULT_SIZE = 4;
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_POLL_MS = 1000;

export function startActionRunners(
  context: TasksContext,
  options: ActionRunnersOptions,
): RunnerPool {
  const holder = options.holder ?? crypto.randomUUID();
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;

  const pool = startRunnerPool(context.clock, {
    size: options.size ?? DEFAULT_SIZE,
    pollMs: options.pollMs ?? DEFAULT_POLL_MS,
    claim: () => claimAction(context, { holder, leaseMs }),
    run: (lease) => runActionAttempt(context, lease, { connectors: options.connectors, leaseMs }),
    onError: options.onError,
  });

  // A record can make an action claimable, such as the queue entry of a step, so an idle runner
  // claims at once instead of after its poll.
  const unsubscribe = subscribeToRecordCommits(context.log.writer, pool.wake);

  return {
    wake: pool.wake,
    stop: async (graceMs) => {
      unsubscribe();

      await pool.stop(graceMs);
    },
  };
}
