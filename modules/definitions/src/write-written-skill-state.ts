import type { Transaction } from 'kysely';
import { canMoveWrittenSkill } from './can-move-written-skill';
import type { DefinitionsTables, WrittenSkillState } from './types';
import { WrittenSkillStateError } from './written-skill-state-error';

export interface WrittenSkillMove {
  readonly approvalID: string;
  readonly to: WrittenSkillState;
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

  if (row === undefined || !canMoveWrittenSkill(row.state, move.to)) {
    throw new WrittenSkillStateError(move.approvalID, row?.state ?? null, move.to);
  }

  await tables
    .updateTable('written_skills')
    .set({ state: move.to, updated_at: move.at })
    .where('approval_id', '=', move.approvalID)
    .execute();

  return row.name;
}
