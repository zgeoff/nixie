import type { Kysely } from 'kysely';
import type { DefinitionsTables } from '../types';
import type { DefinitionChangeView } from './pick-definition-move';
import { toChangeView } from './to-change-view';

export interface NamedChange {
  readonly definitionID: string;
  readonly change: DefinitionChangeView;
}

// A change ID or a short ID names the change
export async function readNamedChange(
  db: Kysely<unknown>,
  name: string,
): Promise<NamedChange | null> {
  const row = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('runtime_task_definitions')
    .selectAll()
    .where((eb) => eb.or([eb('change_id', '=', name), eb('short_id', '=', name)]))
    .executeTakeFirst();

  return row === undefined ? null : { definitionID: row.definition_id, change: toChangeView(row) };
}
