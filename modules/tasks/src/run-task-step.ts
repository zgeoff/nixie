import { StaleWriterError } from '@heynixie/log';
import { LeaseLostError } from './lease-lost-error';
import { readInbox } from './read-inbox';
import { startLeaseRenewal } from './start-lease-renewal';
import type { RunStep, TaskClaim, TasksContext } from './types';
import { writeStepCommit } from './write-step-commit';
import type { StepErrorOptions } from './write-step-error';
import { writeStepError } from './write-step-error';

export interface TaskStepOptions extends StepErrorOptions {
  readonly runStep: RunStep;
  readonly leaseMs: number;
}

// Runs one claimed step: reads the inbox, runs the step under a renewed lease, and commits its
// result. Any failure but a lost lease or a stale writer becomes a step error on this task, so one
// bad step never stops the runners. A lost lease ends the step with nothing written.
export async function runTaskStep(
  context: TasksContext,
  claim: TaskClaim,
  options: TaskStepOptions,
): Promise<void> {
  const renewal = startLeaseRenewal(context, claim.lease, options.leaseMs);

  try {
    const failure = await tryCommitStep(context, claim, { ...options, signal: renewal.signal });

    if (failure !== null) {
      await writeStepError(context, claim, { ...options, error: failure.error });
    }
  } catch (error) {
    if (!(error instanceof LeaseLostError)) {
      throw error;
    }
  } finally {
    await renewal.stop();
  }
}

// runs the step and commits its result, and returns a failure that a retry may clear as a value
async function tryCommitStep(
  context: TasksContext,
  claim: TaskClaim,
  options: TaskStepOptions & { readonly signal: AbortSignal },
): Promise<{ readonly error: unknown } | null> {
  try {
    const inbox = await readInbox(context, claim.lease.workID);
    const result = await options.runStep({
      taskID: claim.lease.workID,
      stepKey: claim.stepKey,
      lease: claim.lease,
      inbox,
      signal: options.signal,
    });

    await writeStepCommit(context, claim, result);
    return null;
  } catch (error) {
    if (error instanceof LeaseLostError || error instanceof StaleWriterError) {
      throw error;
    }
    return { error };
  }
}
