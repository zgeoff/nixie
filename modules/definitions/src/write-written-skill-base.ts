import type { Transaction } from 'kysely';
import type { DefinitionsTables } from './types';
import { WrittenSkillStateError } from './written-skill-state-error';

export interface WrittenSkillBaseChange {
  readonly approvalID: string;
  readonly at: number;
}

export async function writeWrittenSkillBase(
  transaction: Transaction<unknown>,
  change: WrittenSkillBaseChange,
): Promise<string> {
  const tables = transaction.$extendTables<DefinitionsTables>();

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
    .set((expressionBuilder) => ({
      base_hash: expressionBuilder.ref('definitions_hash'),
      base_origin: expressionBuilder.ref('definitions_origin'),
      updated_at: change.at,
    }))
    .where('approval_id', '=', change.approvalID)
    .execute();

  return row.name;
}
