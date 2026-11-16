import { writeRecords } from '@heynixie/log';
import type { WorkerDeps, WorkerPlan, WorkerRunNames } from './types';
import { workerRunStartedCodec } from './worker-run-started-codec';

// Written before the sandbox's create, so a crash that follows leaves the run on the log.
export async function writeWorkerRunStarted(
  deps: Pick<WorkerDeps, 'log' | 'definitions'>,
  plan: WorkerPlan,
  names: WorkerRunNames,
): Promise<void> {
  await writeRecords(deps.log, [
    {
      kind: workerRunStartedCodec.kind,
      definitions: deps.definitions(),
      thread: plan.caller.thread,
      parent: plan.caller.callSequence,
      payload: workerRunStartedCodec.encode({
        workerRunID: names.workerRunID,
        shortID: names.shortID,
        callID: plan.caller.callID,
        stepRunID: plan.caller.stepRunID,
        ...(plan.caller.taskRun === undefined ? {} : { taskRunID: plan.caller.taskRun.runID }),
        model: names.model,
        profile: names.profile,
        tools: [...plan.tools],
        limits: plan.limits,
        isTaskLimit: plan.isTaskLimit,
      }),
    },
  ]);
}
