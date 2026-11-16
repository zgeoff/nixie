import type { Writer } from '@heynixie/log';
import type { DefinitionsTables } from '../types';

// Leaves the versions table empty, as a database rebuilt from the records alone does
export async function seedLostTaskVersions(writer: Pick<Writer, 'db'>): Promise<void> {
  await writer.db
    .$extendTables<DefinitionsTables>()
    .deleteFrom('task_definition_versions')
    .execute();
}
