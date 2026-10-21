import type { Kysely } from 'kysely';
import { readDefinitionsInForce } from './read-definitions-in-force';
import type { DefinitionsTables } from './types';

// Whether the snapshot in force and the store of written skills disagree, as they do after an
// approval or a retirement whose seed failed. The store keeps the change, so a seed of the
// definitions in force settles it, however long after the change it runs.
export async function probeWrittenSkillsPending(db: Kysely<unknown>): Promise<boolean> {
  const inForce = await readDefinitionsInForce(db);

  if (inForce === null) {
    return false;
  }

  const tables = db.$extendTables<DefinitionsTables>();

  const seeded = await tables
    .selectFrom('snapshot_skills')
    .select('approval_id')
    .where('snapshot_hash', '=', inForce.snapshotHash)
    .where('approval_id', 'is not', null)
    .execute();

  const written = await tables
    .selectFrom('written_skills')
    .select('approval_id')
    .where('state', '=', 'in_force')
    .execute();

  const seededIDs = new Set(seeded.map((row) => row.approval_id));

  return (
    seededIDs.size !== written.length || written.some((row) => !seededIDs.has(row.approval_id))
  );
}
