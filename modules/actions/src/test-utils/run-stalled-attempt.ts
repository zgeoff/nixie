import type { TasksContext } from '@heynixie/tasks';
import type { TestClock } from '@heynixie/testing';
import { claimAction } from '../claim-action';
import { runActionAttempt } from '../run-action-attempt';
import { buildStubConnector } from './build-stub-connector';

interface StalledAttemptOptions {
  readonly context: TasksContext;
  readonly clock: TestClock;
}

// Claims the next due action and runs one attempt whose provider call outlives the lease, as a
// runner that stalled or died mid-call does: the attempt record commits, and its result never does.
// Returns how many calls reached the provider.
export async function runStalledAttempt(options: StalledAttemptOptions): Promise<number> {
  const lease = await claimAction(options.context, { holder: 'stalled', leaseMs: 60_000 });

  if (lease === null) {
    throw new Error('no action was due for a stalled attempt');
  }
  const stub = buildStubConnector(() => {
    options.clock.advance(60_000);
    return { kind: 'success', result: {} };
  });

  await runActionAttempt(options.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });
  return stub.calls.length;
}
