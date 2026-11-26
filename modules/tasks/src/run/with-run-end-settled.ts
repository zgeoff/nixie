import type { TaskClaim, TasksContext } from '../types';
import { LeaseLostError } from '../utils/lease-lost-error';
import { RunEndUnsettledError } from './run-end-unsettled-error';
import { settleRunEnd } from './settle-run-end';
import { settledSandboxes } from './settled-sandboxes';

export interface RunEndWait {
  // aborts the wait, which a step does once it lost its lease
  readonly signal?: AbortSignal;

  // the lease of the step that waits, named by the error that an aborted wait throws
  readonly lease?: TaskClaim['lease'];
}

// Runs a write that can end the task's task run. The end waits until the gateway answered a read of
// each sandbox the task run used, however many reads an earlier attempt saved, so the write goes
// again after each read, and nothing of it commits until then. An aborted wait throws and commits nothing.
export function withRunEndSettled<Result>(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log' | 'runSettings'>,
  write: () => Promise<Result>,
  wait: RunEndWait = {},
): Promise<Result> {
  return settledSandboxes.run(new Set(), async () => {
    for (;;) {
      const attempt = await tryWrite(write);

      if (attempt.kind === 'written') {
        return attempt.result;
      }

      const settlement = await settleRunEnd(context, attempt.taskID);

      if (settlement === 'waiting') {
        await waitForGateway(context, wait);
      }
    }
  });
}

type Attempt<Result> =
  | { readonly kind: 'written'; readonly result: Result }
  | { readonly kind: 'unsettled'; readonly taskID: string };

async function tryWrite<Result>(write: () => Promise<Result>): Promise<Attempt<Result>> {
  try {
    return { kind: 'written', result: await write() };
  } catch (error) {
    if (error instanceof RunEndUnsettledError) {
      return { kind: 'unsettled', taskID: error.taskID };
    }

    throw error;
  }
}

// How long a task run that waits for the gateway's answer to its end read tries again after.
const gatewayRetryMs = 5000;

async function waitForGateway(
  context: Pick<TasksContext, 'clock'>,
  wait: RunEndWait,
): Promise<void> {
  await context.clock.sleep(gatewayRetryMs, wait.signal).catch(() => {});

  if (wait.signal?.aborted === true) {
    if (wait.lease === undefined) {
      throw wait.signal.reason;
    }

    throw new LeaseLostError(wait.lease);
  }
}
