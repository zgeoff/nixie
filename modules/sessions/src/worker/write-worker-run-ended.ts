import { writeRecords } from '@heynixie/log';
import type { WorkerDeps, WorkerEnd, WorkerPlan, WorkerRunNames } from './types';
import { workerRunEndedCodec } from './worker-run-ended-codec';
import type { WorkerUsed } from './worker-used';

export interface WorkerRunEnd {
  readonly end: WorkerEnd;
  readonly used: WorkerUsed;
}

// Written after the run's turn records. A failure's detail is erasable, because a service or the
// model wrote it.
export async function writeWorkerRunEnded(
  deps: Pick<WorkerDeps, 'log' | 'definitions'>,
  plan: WorkerPlan,
  names: WorkerRunNames,
  ended: WorkerRunEnd,
): Promise<void> {
  const end = ended.end;

  const detail =
    end.outcome === 'sandbox_failed' || end.outcome === 'model_failed' ? end.detail : null;

  await writeRecords(deps.log, [
    {
      kind: workerRunEndedCodec.kind,
      definitions: deps.definitions(),
      thread: plan.caller.thread,
      parent: plan.caller.callSequence,
      ...(detail === null ? {} : { contentSource: 'untrusted' as const }),
      payload: workerRunEndedCodec.encode({
        workerRunID: names.workerRunID,
        callID: plan.caller.callID,
        ...(plan.caller.taskRun === undefined ? {} : { taskRunID: plan.caller.taskRun.runID }),
        model: names.model,
        profile: names.profile,
        outcome: end.outcome,
        ...(end.outcome === 'limit' ? { limit: end.limit } : {}),
        used: ended.used,
      }),
      ...(detail === null ? {} : { erasable: { detail } }),
    },
  ]);
}
