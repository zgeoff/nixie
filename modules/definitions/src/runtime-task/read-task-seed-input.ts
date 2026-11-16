import type { Kysely } from 'kysely';
import type { DefinitionsTables, RepoTask } from '../types';
import type { TaskSeedInput } from '../utils/build-task-seed-plan';

// Reads the runtime changes in force and which of their versions can still be read.
export async function readTaskSeedInput(
  db: Kysely<unknown>,
  repo: readonly RepoTask[],
): Promise<TaskSeedInput> {
  const tables = db.$extendTables<DefinitionsTables>();

  const rows = await tables
    .selectFrom('runtime_task_definitions')
    .select(['change_id', 'definition_id', 'definition_hash', 'base_hash', 'definitions_hash'])
    .where('state', '=', 'in_force')
    .orderBy('definition_id')
    .execute();

  const hashes = rows.flatMap((row) => (row.definition_hash === null ? [] : [row.definition_hash]));

  const versions =
    hashes.length === 0
      ? []
      : await tables
          .selectFrom('task_definition_versions')
          .select('definition_hash')
          .where('definition_hash', 'in', hashes)
          .execute();

  return {
    repo,
    runtime: rows.map((row) => ({
      changeID: row.change_id,
      definitionID: row.definition_id,
      hash: row.definition_hash,
      base: row.base_hash,
      definitions: row.definitions_hash,
    })),
    readable: new Set(versions.map((version) => version.definition_hash)),
  };
}
