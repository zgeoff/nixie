import { DatabaseError, createShortID } from '@heynixie/db';
import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { match } from 'ts-pattern';
import { requireLease } from '../lease/require-lease';
import { waitAtFaultPoint } from '../lease/wait-at-fault-point';
import { probePauseRequested } from '../pause/probe-pause-requested';
import { readOpenRun } from '../run/read-open-run';
import type { RunEndCause } from '../run/run-end-cause';
import { taskRunReportRequestedCodec } from '../run/task-run-report-requested-codec';
import type { TaskRun } from '../run/types';
import { writeRunEndInTransaction } from '../run/write-run-end-in-transaction';
import { readTaskMark } from '../task/read-task-mark';
import { buildPausedRecord } from '../task/record/build-paused-record';
import { writeTaskCloseInTransaction } from '../task/write-task-close-in-transaction';
import type {
  ResumeState,
  StepResult,
  TaskClaim,
  TaskState,
  TasksContext,
  TasksTables,
} from '../types';
import { resetLease } from '../utils/reset-lease';
import { taskStepCommittedCodec } from '../utils/task-step-committed-codec';
import { readStepCursor } from './read-step-cursor';
import { StepAlreadyCommittedError } from './step-already-committed-error';

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
    const run = await readOpenRun(tx, taskID);

    const hasReport = run !== null && (run.reportID !== null || result.run?.report !== undefined);

    // A started task that reported waits for its starter's next message, and is never done.
    const reportedNext = hasReport && result.next === 'done' ? 'wait' : result.next;
    const nextState = pickNextState(reportedNext, cursor.hasUnread);

    const isPauseRequested = await probePauseRequested(tx, taskID);

    const resumeState = pickPausedResume(nextState, isPauseRequested);

    await writeRecordsInTransaction(tx, context.log, [
      ...result.records.map((record) => ({ ...record, thread: taskID })),
      ...buildReportRequest(context, claim, run, result),
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

    const hasOpenWait = await probeOpenWait(tx, taskID);

    const ending = await writeRunEndInTransaction(tx, context, {
      taskID,
      trigger: {
        kind: 'step',
        hasReport,
        limit: result.run?.limit ?? null,
        isDone: result.next === 'done',
        activity: result.run?.activity ?? 'worked',
        isFirstStep: run?.opened.openedByStep === claim.stepKey,
        hasWork: nextState === 'ready' || hasOpenWait,

        // every started task is woken by messages until the wake rule says otherwise
        isWakeable: true,
      },
      endedBy: `step:${claim.stepKey}`,
      stepKey: claim.stepKey,
    });

    const mark = ending === null ? null : await readTaskMark(tx, taskID);

    if (
      ending !== null &&
      isDisposableEnd(ending.cause) &&
      nextState === 'waiting' &&
      resumeState === null &&
      !hasOpenWait &&
      mark?.disposable === true
    ) {
      await writeTaskCloseInTransaction(tx, context, {
        taskID,
        stepKey: claim.stepKey,
        closedBy: 'disposable',
        endedBy: `step:${claim.stepKey}`,
      });
    }

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

function buildReportRequest(
  context: TasksContext,
  claim: TaskClaim,
  run: TaskRun | null,
  result: StepResult,
): readonly RecordInput[] {
  const report = result.run?.report;

  if (run === null || run.reportID !== null || report === undefined) {
    return [];
  }

  return [
    {
      kind: taskRunReportRequestedCodec.kind,
      definitions: context.definitions(),
      thread: run.taskID,
      payload: taskRunReportRequestedCodec.encode({
        taskID: run.taskID,
        runID: run.runID,
        stepKey: claim.stepKey,
        reportID: createShortID(),
      }),
      erasable: {
        summary: report.summary,
        ...(report.fields === undefined ? {} : { fields: report.fields }),
      },
    },
  ];
}

async function probeOpenWait(tx: Transaction<unknown>, taskID: string): Promise<boolean> {
  const wait = await tx
    .$extendTables<TasksTables>()
    .selectFrom('task_messages')
    .select('message_id')
    .where('from_task', '=', taskID)
    .where('wait_state', '=', 'open')
    .limit(1)
    .executeTakeFirst();

  return wait !== undefined;
}

// A limit end pauses the task so the owner can raise the limit, so only these causes close it.
function isDisposableEnd(cause: RunEndCause): boolean {
  return cause === 'reported' || cause === 'no_report' || cause === 'no_work';
}

function isStepKeyConflict(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes('records.step_key')
  );
}
