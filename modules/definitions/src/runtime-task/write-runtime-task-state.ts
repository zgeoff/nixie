import type { Transaction } from 'kysely';
import type { DefinitionsTables, RuntimeChangeState, RuntimeTaskCause } from '../types';
import { canMoveRuntimeChange } from '../utils/can-move-runtime-change';
import { RuntimeTaskStateError } from './runtime-task-state-error';

export interface RuntimeTaskMove {
  readonly changeID: string;
  readonly to: Exclude<RuntimeChangeState, 'in_force'>;
  readonly cause: RuntimeTaskCause;
  readonly sequence: number;
}

// Throws on a move that canMoveRuntimeChange refuses, so a fold that meets one fails its record.
export async function writeRuntimeTaskState(
  tx: Transaction<unknown>,
  move: RuntimeTaskMove,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

  const row = await tables
    .selectFrom('runtime_task_definitions')
    .select('state')
    .where('change_id', '=', move.changeID)
    .executeTakeFirst();

  if (row === undefined || !canMoveRuntimeChange(row.state, move.to)) {
    throw new RuntimeTaskStateError(move.changeID, row?.state ?? null, move.to);
  }

  await tables
    .updateTable('runtime_task_definitions')
    .set({ state: move.to, state_cause: move.cause, updated_sequence: move.sequence })
    .where('change_id', '=', move.changeID)
    .execute();
}
