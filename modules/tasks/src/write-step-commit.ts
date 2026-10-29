import { DatabaseError } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { match } from 'ts-pattern';
import { buildPausedRecord } from './build-paused-record';
import { probePauseRequested } from './probe-pause-requested';
import { readStepCursor } from './read-step-cursor';
import { requireLease } from './require-lease';
import { resetLease } from './reset-lease';
import { StepAlreadyCommittedError } from './step-already-committed-error';
import { taskStepCommittedCodec } from './task-step-committed-codec';
import type { ResumeState, StepResult, TaskClaim, TaskState, TasksContext } from './types';
import { waitAtFaultPoint } from './wait-at-fault-point';

export async function writeStepCommit(
  context: TasksContext,
  claim: TaskClaim,
  result: StepResult,
): Promise<void> {
  const taskID = claim.lease.workID;
  const faultContext = { kind: 'task', id: taskID } as const;

  requireStepResult(result);

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('step.commit.before', faultContext);
  }

  await withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, claim.lease, context.clock.now());

    const cursor = await readStepCursor(tx, taskID, result.acknowledged);

    const nextState = pickNextState(result.next, cursor.hasUnread);

    const isPauseRequested = await probePauseRequested(tx, taskID);

    const resumeState = pickPausedResume(nextState, isPauseRequested);

    await writeRecordsInTransaction(tx, context.log, [
      ...result.records.map((record) => ({ ...record, thread: taskID })),
      {
        kind: 'task.step_committed',
        definitions: context.definitions(),
        thread: taskID,
        stepKey: claim.stepKey,
        payload: taskStepCommittedCodec.encode({
          taskID,
          nextState,
          readCursor: cursor.readCursor,
          sessionBoundary: result.sessionBoundary ?? null,
          timers: (result.timers ?? []).map((timer) => ({
            timerID: crypto.randomUUID(),
            dueAt: timer.dueAt,
          })),
        }),
      },
      ...(resumeState === null
        ? []
        : [buildPausedRecord(taskID, resumeState, context.definitions())]),
    ]);

    await resetLease(tx, claim.lease);
  }).catch((error: unknown) => {
    throw isStepKeyConflict(error) ? new StepAlreadyCommittedError(claim.stepKey) : error;
  });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('step.commit.after', faultContext);
  }
}

function requireStepResult(result: StepResult): void {
  const keyed = result.records.find((record) => record.stepKey !== undefined);
  const timer = result.timers?.find((candidate) => !Number.isFinite(candidate.dueAt));

  if (keyed !== undefined) {
    throw new Error(`a step's ${keyed.kind} record carries a step key; only its commit does`);
  }

  if (timer !== undefined) {
    throw new Error(`a step's timer is due at ${timer.dueAt}, which is no time`);
  }
}

function pickNextState(next: StepResult['next'], hasUnread: boolean): TaskState {
  return match(next)
    .with('continue', () => 'ready' as const)
    .with('hold', () => 'waiting' as const)
    .with('wait', () => (hasUnread ? 'ready' : 'waiting'))
    .with('done', () => (hasUnread ? 'ready' : 'done'))
    .exhaustive();
}

function pickPausedResume(nextState: TaskState, isPauseRequested: boolean): ResumeState | null {
  if (!isPauseRequested) {
    return null;
  }

  return nextState === 'ready' || nextState === 'waiting' ? nextState : null;
}

function isStepKeyConflict(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes('records.step_key')
  );
}
