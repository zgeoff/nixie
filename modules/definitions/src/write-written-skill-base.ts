import type { Transaction } from 'kysely';
import type { DefinitionsTables } from './types';
import { WrittenSkillStateError } from './written-skill-state-error';

// the skill the approval applied, and when its base moves
export interface WrittenSkillBaseChange {
  readonly approvalID: string;
  readonly at: number;
}

// Makes your definitions' newest version the base of a written skill in force, so nixie's version
// stays and the conflict closes. It refuses a skill that left force, and returns the skill's name.
export async function writeWrittenSkillBase(
  tx: Transaction<unknown>,
  change: WrittenSkillBaseChange,
): Promise<string> {
  const tables = tx.$extendTables<DefinitionsTables>();

  const row = await tables
    .selectFrom('written_skills')
    .select(['name', 'state'])
    .where('approval_id', '=', change.approvalID)
    .executeTakeFirst();

  if (row?.state !== 'in_force') {
    throw new WrittenSkillStateError(change.approvalID, row?.state ?? null, 'in_force');
  }

  await tables
    .updateTable('written_skills')
    .set((eb) => ({
      base_hash: eb.ref('definitions_hash'),
      base_origin: eb.ref('definitions_origin'),
      updated_at: change.at,
    }))
    .where('approval_id', '=', change.approvalID)
    .execute();

  return row.name;
}
