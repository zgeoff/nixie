import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { probeTaskPaused, requireLease, resetLease, waitAtFaultPoint } from '@heynixie/tasks';
import type { ActionRow, ActionsTables, Admission, AdmitTool } from '../types';
import { buildCancelledCheck } from './build-cancelled-check';
import { buildHeldCheck } from './build-held-check';
import type { Attempt } from './leased-records';

// A started attempt runs its call inside its admission, and releases the admission once the call
// has settled.
export type AttemptStart =
  | { readonly kind: 'started'; readonly admission: Admission }
  | { readonly kind: 'barred' }
  | { readonly kind: 'past_deadline' };

export interface AttemptStartOptions {
  // whether a barred attempt releases its lease; a step that holds the task's lease keeps it
  readonly resetWhenBarred: boolean;

  // the tool name prefixes whose actions wait, read before the attempt is written
  readonly readHeldToolPrefixes?: (() => readonly string[]) | undefined;

  // Admits the call as the last act of the start's transaction, after the attempt is written. A
  // hold that began since the check rolls the write back, and a hold that begins after the
  // admission waits for the call.
  readonly admitTool?: AdmitTool | undefined;
}

export function isPastDeadline(action: Pick<ActionRow, 'deadline_at'>, now: number): boolean {
  return action.deadline_at !== null && now >= action.deadline_at;
}

// A stop, a pause, a close or a pause of all of nixie can commit, and the deadline can pass, while
// the policy check runs, so the start reads them again in its own transaction. An action past its
// deadline keeps its lease for the failure.
export async function writeAttemptStarted(
  context: TasksContext,
  attempt: Attempt,
  options: AttemptStartOptions,
): Promise<AttemptStart> {
  const start = await runAttemptStart(context, attempt, options);

  if (start.kind === 'started' && NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('attempt.record.after', {
      kind: 'action',
      id: attempt.action.action_id,
    });
  }

  return start;
}

// Thrown inside the start's transaction to roll the attempt's record back
class HoldBegunError extends Error {
  override name = 'HoldBegunError';
}

// the admission the transaction took, which a failed commit gives back
interface TakenAdmission {
  admission: Admission | null;
}

async function runAttemptStart(
  context: TasksContext,
  attempt: Attempt,
  options: AttemptStartOptions,
): Promise<AttemptStart> {
  const taken: TakenAdmission = { admission: null };

  try {
    return await readAndWriteStart(context, attempt, options, taken);
  } catch (error) {
    taken.admission?.release();

    if (!(error instanceof HoldBegunError)) {
      throw error;
    }
  }

  if (options.resetWhenBarred) {
    await withWriteTransaction(context.log.writer, async (tx) => {
      await resetLease(tx, attempt.lease);
    });
  }

  return { kind: 'barred' };
}

const noAdmission: Admission = { run: (work) => work(), release: () => {} };

function readAndWriteStart(
  context: TasksContext,
  attempt: Attempt,
  options: AttemptStartOptions,
  taken: TakenAdmission,
): Promise<AttemptStart> {
  return withWriteTransaction(context.log.writer, async (tx): Promise<AttemptStart> => {
    const now = context.clock.now();

    await requireLease(tx, attempt.lease, now);

    const action = await tx
      .$extendTables<ActionsTables>()
      .selectFrom('actions')
      .innerJoin('tasks', 'tasks.task_id', 'actions.task_id')
      .select((eb) => eb.or([buildCancelledCheck(eb), buildHeldCheck(eb)]).as('is_barred'))
      .select(['actions.held_by_proposal_id', 'actions.deadline_at', 'actions.tool'])
      .where('actions.action_id', '=', attempt.action.action_id)
      .executeTakeFirstOrThrow();

    const isPaused = await probeTaskPaused(tx, attempt.action.task_id);

    const isBarred = action.is_barred === 1 || action.is_barred === true;
    const isToolHeld = probeToolHeld(options, action.tool);

    if (isBarred || isPaused || isToolHeld || action.held_by_proposal_id !== null) {
      if (options.resetWhenBarred) {
        await resetLease(tx, attempt.lease);
      }

      return { kind: 'barred' };
    }

    if (isPastDeadline(action, now)) {
      return { kind: 'past_deadline' };
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'action.attempt_started',
        definitions: context.definitions(),
        thread: attempt.action.task_id,
        payload: { actionID: attempt.action.action_id, attempt: attempt.attempt },
      },
    ]);

    if (NIXIE_TEST_BUILD) {
      await waitAtFaultPoint('attempt.admit.before', {
        kind: 'action',
        id: attempt.action.action_id,
      });
    }

    // The admission checks the hold and counts the call as running in one synchronous step, so a
    // hold either rolls this attempt back or waits for its call.
    const admission =
      options.admitTool === undefined ? noAdmission : options.admitTool(action.tool);

    if (admission === null) {
      throw new HoldBegunError();
    }

    taken.admission = admission;

    return { kind: 'started', admission };
  });
}

function probeToolHeld(options: AttemptStartOptions, tool: string): boolean {
  const heldPrefixes = options.readHeldToolPrefixes?.() ?? [];

  return heldPrefixes.some((prefix) => tool.startsWith(prefix));
}
