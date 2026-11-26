import type { LogRecord } from '@heynixie/log';
import { StaleWriterError } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { readTaskGateSnapshot } from '../gate/read-task-gate-snapshot';
import { readInbox } from '../inbox/read-inbox';
import { startLeaseRenewal } from '../lease/start-lease-renewal';
import { pickRunDefinition } from '../run/pick-run-definition';
import { readDefinitionRunFacts } from '../run/read-definition-run-facts';
import { readOpenRun } from '../run/read-open-run';
import type { TaskRun } from '../run/types';
import type { StepErrorOptions } from '../step/build-step-failure-plan';
import { isBeforeTurnFailure } from '../step/is-before-turn-failure';
import { isSpendRefusal } from '../step/is-spend-refusal';
import { startStepControlWatch } from '../step/start-step-control-watch';
import { writeStepCommit } from '../step/write-step-commit';
import { writeStepError } from '../step/write-step-error';
import { writeStepHeld } from '../step/write-step-held';
import type { RunStep, StartedClaim, StepErrored, StepResult, TasksContext } from '../types';
import { LeaseLostError } from '../utils/lease-lost-error';
import { readSessionBoundary } from './read-session-boundary';

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
    const signal = AbortSignal.any([renewal.signal, controls.ended]);

    const failure = await tryCommitStep(context, claim, {
      ...options,
      signal,
      interrupt: controls.interrupted,
    });

    if (failure === null) {
      return null;
    }

    const isStopped = await probeFailureOfSpendStop(context, claim, failure.error);

    if (isStopped) {
      await writeStepCommit(
        context,
        claim,
        {
          next: 'continue',
          records: [],
          acknowledged: [],
          sessionBoundary: await readSessionBoundary(context, claim.lease.workID),
        },
        signal,
      );

      return null;
    }

    return await writeStepError(context, claim, { ...options, error: failure.error }, signal);
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

    const result = await runOrHoldStep(context, claim, options, {
      run,
      inbox,
      sessionBoundary,
    });

    if (result.isHeld === true) {
      await writeStepHeld(context, claim);

      return null;
    }

    await writeStepCommit(context, claim, result, options.signal);

    return null;
  } catch (error) {
    if (error instanceof LeaseLostError || error instanceof StaleWriterError) {
      throw error;
    }

    return { error };
  }
}

interface StepRead {
  readonly run: TaskRun | null;
  readonly inbox: readonly LogRecord[];
  readonly sessionBoundary: string | null;
}

// A definition's task with no task run calls no runner: the step holds, so an unread message stays
// unread, and it marks read each fire that this release's codec does not know.
async function runOrHoldStep(
  context: TasksContext,
  claim: StartedClaim,
  options: TaskStepOptions & { readonly signal: AbortSignal; readonly interrupt: AbortSignal },
  read: StepRead,
): Promise<StepResult> {
  const taskID = claim.lease.workID;

  const definition = await readDefinitionRunFacts(context.log.writer.db, taskID);

  if (definition !== null) {
    const pick = pickRunDefinition(definition.facts);

    if (pick.kind === 'open') {
      throw new Error(
        `no version of hash ${pick.definitionHash} is stored, so the task ${taskID} opens no task run`,
      );
    }

    if (read.run === null) {
      return {
        next: 'hold',
        records: [],
        acknowledged: definition.unknownFires,
        sessionBoundary: read.sessionBoundary,
      };
    }
  }

  return options.runStep({
    run: read.run,
    taskID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: read.inbox,
    wake: claim.wake,
    sessionBoundary: read.sessionBoundary,
    signal: options.signal,
    interrupt: options.interrupt,
  });
}

// A step that ran a model turn and failed while the stop stands, or that the gateway refused at its
// route's limit, failed because of the stop. It counts no step error, and the task keeps its state and its work for the next
// claim, which comes after the stop clears.
async function probeFailureOfSpendStop(
  context: TasksContext,
  claim: StartedClaim,
  error: unknown,
): Promise<boolean> {
  if (isBeforeTurnFailure(error)) {
    return false;
  }

  if (isSpendRefusal(error)) {
    return true;
  }

  const gate = await readTaskGateSnapshot(context, claim.lease.workID);

  return !gate.open && gate.reason === 'spend';
}
