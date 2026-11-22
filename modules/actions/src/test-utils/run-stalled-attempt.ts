import type { TasksContext } from '@heynixie/tasks';
import type { FakeClock } from '@zgeoff/testing/clock';
import { claimAction } from '../action/claim-action';
import { runActionAttempt } from '../action/run-action-attempt';
import { buildStubConnector } from './build-stub-connector';

interface StalledAttemptOptions {
  readonly context: TasksContext;
  readonly clock: FakeClock;
}

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
