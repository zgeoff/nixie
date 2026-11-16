import type { Kysely } from 'kysely';
import type { DefinitionsTables } from '../types';
import type { DefinitionChangeView } from './pick-definition-move';
import { toChangeView } from './to-change-view';

// The definition's change with the greatest changed_sequence
export async function readDefinitionHead(
  db: Kysely<unknown>,
  definitionID: string,
): Promise<DefinitionChangeView | null> {
  const row = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('runtime_task_definitions')
    .selectAll()
    .where('definition_id', '=', definitionID)
    .orderBy('changed_sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row === undefined ? null : toChangeView(row);
}
