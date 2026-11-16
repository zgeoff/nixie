import type { Transaction } from 'kysely';
import type { DefinitionsTables } from '../types';
import { toCanonicalJSON } from '../utils/to-canonical-json';
import type { TaskDefinition } from './types';

// A version is never rewritten, because its hash covers its content.
export async function writeTaskVersions(
  tx: Transaction<unknown>,
  definitions: readonly TaskDefinition[],
): Promise<void> {
  if (definitions.length === 0) {
    return;
  }

  await tx
    .$extendTables<DefinitionsTables>()
    .insertInto('task_definition_versions')
    .values(
      definitions.map((definition) => ({
        definition_hash: definition.hash,
        definition_id: definition.id,
        form: toCanonicalJSON(definition.form),
        files: toCanonicalJSON(definition.files),
      })),
    )
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}
