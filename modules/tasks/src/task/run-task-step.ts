import { StaleWriterError } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { readInbox } from '../inbox/read-inbox';
import { startLeaseRenewal } from '../lease/start-lease-renewal';
import { readOpenRun } from '../run/read-open-run';
import type { StepErrorOptions } from '../step/build-step-failure-plan';
import { startStepControlWatch } from '../step/start-step-control-watch';
import { writeStepCommit } from '../step/write-step-commit';
import { writeStepError } from '../step/write-step-error';
import type { RunStep, StartedClaim, StepErrored, StepResult, TasksContext } from '../types';
import { LeaseLostError } from '../utils/lease-lost-error';
import { readSessionBoundary } from './read-session-boundary';
import { withTurnSpendOnFailure } from './with-turn-spend-on-failure';

export interface TaskStepOptions extends StepErrorOptions {
  readonly runStep: RunStep;
  readonly leaseMs: number;
  readonly logger: Logger;
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
    const run = await readOpenRun(context.log.writer.db, claim.lease.workID);

    const result =
      run === null || run.reportID === null
        ? await options.runStep({
            run,
            taskID: claim.lease.workID,
            stepKey: claim.stepKey,
            lease: claim.lease,
            inbox,
            wake: claim.wake,
            sessionBoundary,
            signal: options.signal,
            interrupt: options.interrupt,
          })
        : buildReportOnlyResult(sessionBoundary);

    const spend =
      result.spentDollars === undefined
        ? null
        : {
            taskID: claim.lease.workID,
            dollars: result.spentDollars,
            ...(run === null ? {} : { taskRunID: run.runID }),
          };

    await withTurnSpendOnFailure(context, { spend, logger: options.logger }, () =>
      writeStepCommit(context, claim, result),
    );

    return null;
  } catch (error) {
    if (error instanceof LeaseLostError || error instanceof StaleWriterError) {
      throw error;
    }

    return { error };
  }
}

// The rerun of a step that asked for its report runs no model turn, so its commit sends the report
// and reads none of the inbox.
function buildReportOnlyResult(sessionBoundary: string | null): StepResult {
  return { next: 'wait', records: [], acknowledged: [], sessionBoundary };
}
