import { LeaseLostError } from './lease-lost-error';
import { readInbox } from './read-inbox';
import { startLeaseRenewal } from './start-lease-renewal';
import type { RunStep, StepResult, TaskClaim, TasksContext } from './types';
import { writeStepCommit } from './write-step-commit';
import type { StepErrorOptions } from './write-step-error';
import { writeStepError } from './write-step-error';

export interface TaskStepOptions extends StepErrorOptions {
  readonly runStep: RunStep;
  readonly leaseMs: number;
}

// Runs one claimed step: reads the inbox, runs the step under a renewed lease, and commits its
// result, or records its error. A lost lease ends the step with nothing written, because the
// runner that holds the lease now reruns it.
export async function runTaskStep(
  context: TasksContext,
  claim: TaskClaim,
  options: TaskStepOptions,
): Promise<void> {
  const renewal = startLeaseRenewal(context, claim.lease, options.leaseMs);

  try {
    const outcome = await tryRunStep(claim, options, {
      inbox: await readInbox(context, claim.lease.workID),
      signal: renewal.signal,
    });

    await (outcome.ok
      ? writeStepCommit(context, claim, outcome.result)
      : writeStepError(context, claim, { ...options, error: outcome.error }));
  } catch (error) {
    if (!(error instanceof LeaseLostError)) {
      throw error;
    }
  } finally {
    await renewal.stop();
  }
}

type StepOutcome =
  | { readonly ok: true; readonly result: StepResult }
  | { readonly ok: false; readonly error: unknown };

async function tryRunStep(
  claim: TaskClaim,
  options: TaskStepOptions,
  input: Pick<Parameters<RunStep>[0], 'inbox' | 'signal'>,
): Promise<StepOutcome> {
  try {
    const result = await options.runStep({
      taskID: claim.lease.workID,
      stepKey: claim.stepKey,
      ...input,
    });

    return { ok: true, result };
  } catch (error) {
    return { ok: false, error };
  }
}
