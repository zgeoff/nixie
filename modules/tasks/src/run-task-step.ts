import { StaleWriterError } from '@heynixie/log';
import { LeaseLostError } from './lease-lost-error';
import { readInbox } from './read-inbox';
import { readSessionBoundary } from './read-session-boundary';
import { startLeaseRenewal } from './start-lease-renewal';
import { startStepControlWatch } from './start-step-control-watch';
import type { RunStep, StartedClaim, StepErrored, TasksContext } from './types';
import { writeStepCommit } from './write-step-commit';
import type { StepErrorOptions } from './write-step-error';
import { writeStepError } from './write-step-error';

export interface TaskStepOptions extends StepErrorOptions {
  readonly runStep: RunStep;
  readonly leaseMs: number;
}

export async function runTaskStep(
  context: TasksContext,
  claim: StartedClaim,
  options: TaskStepOptions,
): Promise<StepErrored | null> {
  const renewal = startLeaseRenewal(context, claim.lease, options.leaseMs);
  const controls = startStepControlWatch(context, claim);

  try {
    const failure = await tryCommitStep(context, claim, {
      ...options,
      signal: AbortSignal.any([renewal.signal, controls.ended]),
      interrupt: controls.interrupted,
    });

    return failure === null
      ? null
      : await writeStepError(context, claim, { ...options, error: failure.error });
  } catch (error) {
    if (!(error instanceof LeaseLostError)) {
      throw error;
    }

    return null;
  } finally {
    await Promise.all([renewal.stop(), controls.stop()]);
  }
}

async function tryCommitStep(
  context: TasksContext,
  claim: StartedClaim,
  options: TaskStepOptions & { readonly signal: AbortSignal; readonly interrupt: AbortSignal },
): Promise<{ readonly error: unknown } | null> {
  try {
    const inbox = await readInbox(context, claim.lease.workID);
    const sessionBoundary = await readSessionBoundary(context, claim.lease.workID);

    const result = await options.runStep({
      taskID: claim.lease.workID,
      stepKey: claim.stepKey,
      lease: claim.lease,
      inbox,
      wake: claim.wake,
      sessionBoundary,
      signal: options.signal,
      interrupt: options.interrupt,
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
