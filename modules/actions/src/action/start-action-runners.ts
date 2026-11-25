import type { ConnectorLookup } from '@heynixie/connectors';
import { subscribeToRecordCommits } from '@heynixie/log';
import type { ClaimPool, TasksContext } from '@heynixie/tasks';
import { startClaimPool } from '@heynixie/tasks';
import type { AdmitTool } from '../types';
import type { AttemptCheck } from './attempt-check';
import { claimAction } from './claim-action';
import { runActionAttempt } from './run-action-attempt';

export interface ActionRunnersOptions {
  readonly connectors: ConnectorLookup;
  readonly onError: (error: unknown) => void;

  // decides an action again before each attempt
  readonly checkAttempt?: AttemptCheck;

  // see ClaimActionOptions
  readonly readHeldToolPrefixes?: () => readonly string[];

  // see ActionAttemptOptions
  readonly admitTool?: AdmitTool;

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
): ClaimPool {
  const holder = options.holder ?? crypto.randomUUID();
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;

  const pool = startClaimPool(context.clock, {
    size: options.size ?? DEFAULT_SIZE,
    pollMs: options.pollMs ?? DEFAULT_POLL_MS,
    claim: () =>
      claimAction(context, {
        holder,
        leaseMs,
        ...(options.readHeldToolPrefixes === undefined
          ? {}
          : { readHeldToolPrefixes: options.readHeldToolPrefixes }),
      }),
    run: (lease) =>
      runActionAttempt(context, lease, {
        connectors: options.connectors,
        leaseMs,
        ...(options.checkAttempt === undefined ? {} : { checkAttempt: options.checkAttempt }),
        ...(options.readHeldToolPrefixes === undefined
          ? {}
          : { readHeldToolPrefixes: options.readHeldToolPrefixes }),
        ...(options.admitTool === undefined ? {} : { admitTool: options.admitTool }),
      }),
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
