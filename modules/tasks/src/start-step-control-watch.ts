import { subscribeToRecords } from '@heynixie/log';
import { parseTaskRecord } from './parse-task-record';
import type { StartedClaim, TasksContext } from './types';

export interface StepControlWatch {
  readonly ended: AbortSignal;
  readonly interrupted: AbortSignal;

  readonly stop: () => Promise<void>;
}

export function startStepControlWatch(
  context: Pick<TasksContext, 'log'>,
  claim: StartedClaim,
): StepControlWatch {
  const ended = new AbortController();
  const interrupted = new AbortController();
  const watching = new AbortController();

  const watched = readStepControls(context, claim, {
    signal: watching.signal,
    onEnded: () => {
      ended.abort(new Error(`the user ended task ${claim.lease.workID}`));
    },
    onInterrupted: () => {
      interrupted.abort(new Error(`the user interrupted step ${claim.stepKey}`));
    },
  });

  return {
    ended: ended.signal,
    interrupted: interrupted.signal,
    stop: async () => {
      watching.abort();

      await watched;
    },
  };
}

interface ControlHandlers {
  readonly signal: AbortSignal;
  readonly onEnded: () => void;
  readonly onInterrupted: () => void;
}

// A stop or a close frees the step's lease in the same transaction as its record, so a watch that
// fails still leaves the step unable to commit.
async function readStepControls(
  context: Pick<TasksContext, 'log'>,
  claim: StartedClaim,
  handlers: ControlHandlers,
): Promise<void> {
  const entries = subscribeToRecords(context.log, {
    afterSequence: claim.startSequence,
    thread: claim.lease.workID,
    signal: handlers.signal,
  });

  try {
    for await (const entry of entries) {
      const parsed = parseTaskRecord(entry.record);

      if (parsed?.kind === 'task.interrupted' && parsed.stepKey === claim.stepKey) {
        handlers.onInterrupted();
      }

      if (parsed?.kind === 'task.stopped' || parsed?.kind === 'task.closed') {
        handlers.onEnded();

        return;
      }
    }
  } catch {}
}
