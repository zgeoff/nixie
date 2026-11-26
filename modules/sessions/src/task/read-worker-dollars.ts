import type { TaskRun, TasksContext } from '@heynixie/tasks';
import { readRunRecords } from '@heynixie/tasks';
import { workerGatewayChargedCodec } from '../worker/worker-gateway-charged-codec';
import { workerTurnEndedCodec } from '../worker/worker-turn-ended-codec';

// What the worker runs of the task run charged: each ended turn, and each charge that the gateway's
// count of a worker sandbox added.
export async function readWorkerDollars(
  context: Pick<TasksContext, 'log' | 'runners'>,
  run: TaskRun,
): Promise<number> {
  const records = await readRunRecords(context, run, [
    workerTurnEndedCodec.kind,
    workerGatewayChargedCodec.kind,
  ]);

  let dollars = 0;

  for (const record of records) {
    dollars +=
      record.kind === workerTurnEndedCodec.kind
        ? workerTurnEndedCodec.decode(record.payload).dollars
        : workerGatewayChargedCodec.decode(record.payload).dollars;
  }

  return dollars;
}
