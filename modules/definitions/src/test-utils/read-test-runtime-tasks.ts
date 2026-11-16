import type { Writer } from '@heynixie/log';
import type { DefinitionsTables, RuntimeTaskDefinitionRow } from '../types';

// Every runtime change of a task definition, oldest first
export function readTestRuntimeTasks(
  writer: Pick<Writer, 'db'>,
): Promise<readonly RuntimeTaskDefinitionRow[]> {
  return writer.db
    .$extendTables<DefinitionsTables>()
    .selectFrom('runtime_task_definitions')
    .selectAll()
    .orderBy('changed_sequence')
    .execute();
}
