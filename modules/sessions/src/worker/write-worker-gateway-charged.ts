import { writeRecords } from '@heynixie/log';
import type { WorkerDeps, WorkerPlan, WorkerRunNames } from './types';
import { workerGatewayChargedCodec } from './worker-gateway-charged-codec';

// The excess of the gateway's dollars over the worker's own priced calls, which a later step of the
// task run reads through its meter.
export async function writeWorkerGatewayCharged(
  deps: Pick<WorkerDeps, 'log' | 'definitions'>,
  plan: WorkerPlan,
  names: WorkerRunNames,
  dollars: number,
): Promise<void> {
  await writeRecords(deps.log, [
    {
      kind: workerGatewayChargedCodec.kind,
      definitions: deps.definitions(),
      thread: plan.caller.thread,
      parent: plan.caller.callSequence,
      payload: workerGatewayChargedCodec.encode({
        workerRunID: names.workerRunID,
        callID: plan.caller.callID,
        ...(plan.caller.taskRun === undefined ? {} : { taskRunID: plan.caller.taskRun.runID }),
        dollars,
      }),
    },
  ]);
}
