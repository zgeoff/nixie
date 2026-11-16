import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { DefinitionsInForce, RepoTask } from '../types';

const repoTaskSchema = z.object({ id: z.string(), hash: z.string() });
const repoTasksSchema = z.object({ repoTasks: z.array(repoTaskSchema).optional() });

type SeedRecordTables = Readonly<{
  records: { readonly sequence: number; readonly payload: string };
}>;

// The task definitions that the repo held at the last accepted seed, before any runtime change.
// A seed record from before it carried the list falls back to the snapshot's entries that the
// repo owns, so a runtime task never reads as the repo's.
export async function readRepoTasks(
  db: Kysely<unknown>,
  inForce: DefinitionsInForce,
): Promise<readonly RepoTask[]> {
  const record = await db
    .$extendTables<SeedRecordTables>()
    .selectFrom('records')
    .select('payload')
    .where('sequence', '=', inForce.recordSequence)
    .executeTakeFirstOrThrow();

  const stored = repoTasksSchema.parse(JSON.parse(record.payload)).repoTasks;

  if (stored !== undefined) {
    return stored;
  }

  return inForce.tasks.flatMap((task) =>
    task.origin === 'definitions' ? [{ id: task.id, hash: task.hash }] : [],
  );
}
