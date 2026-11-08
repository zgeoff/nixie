import type { Transaction } from 'kysely';
import { canMoveRuntimeChange } from './can-move-runtime-change';
import { RuntimeRuleStateError } from './runtime-rule-state-error';
import type { DefinitionsTables, RuntimeChangeState } from './types';

export interface RuntimeRuleMove {
  readonly changeID: string;
  readonly to: RuntimeChangeState;
  readonly at: number;
}

export async function writeRuntimeRuleState(
  tx: Transaction<unknown>,
  move: RuntimeRuleMove,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

  const row = await tables
    .selectFrom('runtime_rules')
    .select('state')
    .where('change_id', '=', move.changeID)
    .executeTakeFirst();

  if (row === undefined || !canMoveRuntimeChange(row.state, move.to)) {
    throw new RuntimeRuleStateError(move.changeID, row?.state ?? null, move.to);
  }

  await tables
    .updateTable('runtime_rules')
    .set({ state: move.to, updated_at: move.at })
    .where('change_id', '=', move.changeID)
    .execute();
}
