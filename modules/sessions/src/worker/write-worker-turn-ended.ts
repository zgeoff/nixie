import { writeRecords } from '@heynixie/log';
import type { ModelCallUsage } from '@heynixie/wire';
import type { WorkerDeps, WorkerPlan, WorkerRunNames } from './types';
import { workerTurnEndedCodec } from './worker-turn-ended-codec';

export interface WorkerTurn {
  readonly turn: number;
  readonly usage: ModelCallUsage;
  readonly dollars: number;
  readonly text: string;
}

// One per worker model call. The dollars are the call's, priced on the worker's profile, and the
// calling task run's meter adds them as they are.
export async function writeWorkerTurnEnded(
  deps: Pick<WorkerDeps, 'log' | 'definitions'>,
  plan: Pick<WorkerPlan, 'caller'>,
  names: WorkerRunNames,
  ended: WorkerTurn,
): Promise<void> {
  await writeRecords(deps.log, [
    {
      kind: workerTurnEndedCodec.kind,
      definitions: deps.definitions(),
      thread: plan.caller.thread,
      parent: plan.caller.callSequence,
      contentSource: 'untrusted',
      payload: workerTurnEndedCodec.encode({
        workerRunID: names.workerRunID,
        callID: plan.caller.callID,
        ...(plan.caller.taskRun === undefined ? {} : { taskRunID: plan.caller.taskRun.runID }),
        model: names.model,
        profile: names.profile,
        turn: ended.turn,
        inputTokens: ended.usage.uncachedInputTokens,
        outputTokens: ended.usage.outputTokens,
        cacheReadTokens: ended.usage.cacheReadTokens,
        cacheWriteTokens: ended.usage.cacheWrite5mTokens + ended.usage.cacheWrite1hTokens,
        dollars: ended.dollars,
      }),
      erasable: { text: ended.text },
    },
  ]);
}
