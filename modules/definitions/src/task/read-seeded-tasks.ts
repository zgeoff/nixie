import type { Kysely } from 'kysely';
import { storedTasksSchema } from '../definition/stored-tasks-schema';
import type { DefinitionsTables } from '../types';
import type { SeededTasks } from './pick-seeded-sequence';

interface SeedPage {
  // the page starts after this seed, or from the newest with null
  readonly beforeSeed: number | null;
  readonly limit: number;
}

// The tasks of each seed, newest first, one page at a time.
export async function readSeededTasks(
  db: Kysely<unknown>,
  page: SeedPage,
): Promise<readonly (SeededTasks & { readonly seed: number })[]> {
  const beforeSeed = page.beforeSeed;

  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('definition_seeds')
    .innerJoin(
      'definition_snapshots',
      'definition_snapshots.snapshot_hash',
      'definition_seeds.snapshot_hash',
    )
    .select([
      'definition_seeds.seed',
      'definition_seeds.record_sequence',
      'definition_snapshots.form',
    ])
    .$if(beforeSeed !== null, (builder) =>
      builder.where('definition_seeds.seed', '<', beforeSeed ?? 0),
    )
    .orderBy('definition_seeds.seed', 'desc')
    .limit(page.limit)
    .execute();

  return rows.map((row) => ({
    seed: row.seed,
    recordSequence: row.record_sequence,
    tasks: storedTasksSchema.parse(JSON.parse(row.form)).tasks,
  }));
}
