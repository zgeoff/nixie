import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { readLimitRecords } from './read-limit-records';
import { taskLimitReachedCodec } from './task-limit-reached-codec';
import { taskLimitsRaisedCodec } from './task-limits-raised-codec';
import type { TaskLimits, TasksContext } from './types';

export type TaskLimitHold = 'free' | 'held';

export type TaskLimitHoldMove =
  | {
      readonly kind: 'reach';
      readonly stepKey: string;
      readonly used: TaskLimits;
      readonly limits: TaskLimits;
    }
  | { readonly kind: 'raise'; readonly limits: TaskLimits };

// The newest of the two limit records on a task's thread is its hold, so only these moves exist.
const holdMoves: Readonly<Record<TaskLimitHold, readonly TaskLimitHoldMove['kind'][]>> = {
  free: ['reach'],
  held: ['raise'],
};

export async function writeTaskLimitHoldInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'definitions' | 'log'>,
  taskID: string,
  move: TaskLimitHoldMove,
): Promise<void> {
  const records = await readLimitRecords(tx, taskID);

  const hold: TaskLimitHold = records.heldAt === null ? 'free' : 'held';

  invariant(
    isLimitHoldMoveAllowed(hold, move.kind),
    `a task whose limit hold is ${hold} cannot take a ${move.kind}`,
  );

  await writeRecordsInTransaction(tx, context.log, [
    match(move)
      .with({ kind: 'reach' }, (reach) => ({
        kind: taskLimitReachedCodec.kind,
        definitions: context.definitions(),
        thread: taskID,
        payload: taskLimitReachedCodec.encode({
          taskID,
          stepKey: reach.stepKey,
          used: reach.used,
          limits: reach.limits,
        }),
      }))
      .with({ kind: 'raise' }, (raise) => ({
        kind: taskLimitsRaisedCodec.kind,
        definitions: context.definitions(),
        thread: taskID,
        payload: taskLimitsRaisedCodec.encode({ taskID, limits: raise.limits }),
      }))
      .exhaustive(),
  ]);
}

export function isLimitHoldMoveAllowed(
  hold: TaskLimitHold,
  move: TaskLimitHoldMove['kind'],
): boolean {
  return holdMoves[hold].includes(move);
}
