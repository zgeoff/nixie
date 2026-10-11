import { DatabaseError } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { isInboxRecord } from './is-inbox-record';
import { planReadCursor } from './plan-read-cursor';
import { requireLease } from './require-lease';
import { resetLease } from './reset-lease';
import { StepAlreadyCommittedError } from './step-already-committed-error';
import type { StepResult, TaskClaim, TaskState, TasksContext, TasksTables } from './types';
import { waitAtFaultPoint } from './wait-at-fault-point';

// Commits a step: its records, the moved inbox cursor, its timers and the task's next state, in
// one transaction keyed by the step key, and frees the lease. The lease check comes first, so a
// runner whose lease expired commits nothing, and the unique step key fails a second commit.
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
    await writeRecordsInTransaction(tx, context.log, [
      ...result.records.map((record) => ({ ...record, thread: taskID })),
      {
        kind: 'task.step_committed',
        definitions: context.definitions(),
        thread: taskID,
        stepKey: claim.stepKey,
        payload: {
          taskID,
          nextState: pickNextState(result.next, cursor.hasUnread),
          readCursor: cursor.readCursor,
          sessionBoundary: result.sessionBoundary ?? null,
          timers: (result.timers ?? []).map((timer) => ({
            timerID: crypto.randomUUID(),
            dueAt: timer.dueAt,
          })),
        },
      },
    ]);
    await resetLease(tx, claim.lease);
  }).catch((error: unknown) => {
    throw isStepKeyConflict(error) ? new StepAlreadyCommittedError(claim.stepKey) : error;
  });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('step.commit.after', faultContext);
  }
}

interface StepCursor {
  readonly readCursor: number;
  readonly hasUnread: boolean;
}

// where the step's acknowledgements move the read cursor, and whether input stays unread after it
async function readStepCursor(
  tx: Transaction<unknown>,
  taskID: string,
  acknowledged: readonly number[],
): Promise<StepCursor> {
  const db = tx.$extendTables<TasksTables>();
  const task = await db
    .selectFrom('tasks')
    .select(['read_cursor', 'last_inbox_sequence'])
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();
  const unread = await db
    .selectFrom('records')
    .select(['sequence', 'kind', 'thread'])
    .where('thread', '=', taskID)
    .where('sequence', '>', task.read_cursor)
    .orderBy('sequence')
    .execute();
  const readCursor = planReadCursor(
    unread.filter((record) => isInboxRecord(record)).map((record) => record.sequence),
    task.read_cursor,
    acknowledged,
  );

  return { readCursor, hasUnread: task.last_inbox_sequence > readCursor };
}

// only the commit record carries the step key, which the log holds unique, and a timer's due time
// must survive the record's JSON
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

// A task with unread input is ready whatever its step chose, because input that arrived during the
// step still needs a step to read it.
function pickNextState(next: StepResult['next'], hasUnread: boolean): TaskState {
  if (hasUnread || next === 'continue') {
    return 'ready';
  }
  return next === 'done' ? 'done' : 'waiting';
}

function isStepKeyConflict(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes('records.step_key')
  );
}
