import type { Kysely } from 'kysely';
import { readRepoTasks } from '../seed/read-repo-tasks';
import type { DefinitionsInForce } from '../types';

// The repo's version of the definition at the last accepted seed
export async function readRepoHash(
  db: Kysely<unknown>,
  inForce: DefinitionsInForce,
  definitionID: string,
): Promise<string | null> {
  const repo = await readRepoTasks(db, inForce);

  return repo.find((task) => task.id === definitionID)?.hash ?? null;
}
