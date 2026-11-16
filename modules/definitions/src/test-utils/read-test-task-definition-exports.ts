import type { Writer } from '@heynixie/log';
import type { DefinitionsTables } from '../types';

// Every export of task definitions, by export ID
export function readTestTaskDefinitionExports(writer: Pick<Writer, 'db'>) {
  return writer.db
    .$extendTables<DefinitionsTables>()
    .selectFrom('task_definition_exports')
    .selectAll()
    .orderBy('export_id')
    .execute();
}
