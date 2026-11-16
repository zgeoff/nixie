import type { Kysely } from 'kysely';
import { pickRunDefinition } from './pick-run-definition';
import { readDefinitionRunFacts } from './read-definition-run-facts';

// Whether the next claim opens a task run of the definition's task. A task that is no definition's
// has none pending.
export async function probeDefinitionRunPending(
  db: Kysely<unknown>,
  taskID: string,
): Promise<boolean> {
  const read = await readDefinitionRunFacts(db, taskID);

  return read !== null && pickRunDefinition(read.facts).kind === 'open';
}
