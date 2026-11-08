import type { Transaction } from 'kysely';
import { canMoveRuntimeChange } from './can-move-runtime-change';
import type { DefinitionsTables, RuntimeChangeState } from './types';
import { WrittenSkillStateError } from './written-skill-state-error';

export interface WrittenSkillMove {
  readonly approvalID: string;
  readonly to: RuntimeChangeState;
  readonly at: number;
}

export async function writeWrittenSkillState(
  tx: Transaction<unknown>,
  move: WrittenSkillMove,
): Promise<string> {
  const tables = tx.$extendTables<DefinitionsTables>();

  const row = await tables
    .selectFrom('written_skills')
    .select(['name', 'state'])
    .where('approval_id', '=', move.approvalID)
    .executeTakeFirst();

  if (row === undefined || !canMoveRuntimeChange(row.state, move.to)) {
    throw new WrittenSkillStateError(move.approvalID, row?.state ?? null, move.to);
  }

  await tables
    .updateTable('written_skills')
    .set({ state: move.to, updated_at: move.at })
    .where('approval_id', '=', move.approvalID)
    .execute();

  return row.name;
}
