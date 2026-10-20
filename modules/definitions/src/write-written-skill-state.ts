import type { Transaction } from 'kysely';
import { canMoveWrittenSkill } from './can-move-written-skill';
import type { DefinitionsTables, WrittenSkillState } from './types';
import { WrittenSkillStateError } from './written-skill-state-error';

// the skill the approval applied, the state it moves to, and when
export interface WrittenSkillMove {
  readonly approvalID: string;
  readonly to: WrittenSkillState;
  readonly at: number;
}

// Moves a skill that nixie wrote to a new state, inside the caller's write transaction, and refuses
// a move the transition table lacks with nothing written. It returns the skill's name.
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
