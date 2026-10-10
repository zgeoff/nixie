import type { Kysely } from 'kysely';
import type { DefinitionsInForce, DefinitionsTables } from './types';

// The definitions the newest seed put in force, or null before the first seed. Every record takes
// its snapshot hash from here.
export async function findDefinitionsInForce(
  db: Kysely<unknown>,
): Promise<DefinitionsInForce | null> {
  const row = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('definition_seeds')
    .innerJoin(
      'definition_snapshots',
      'definition_snapshots.snapshot_hash',
      'definition_seeds.snapshot_hash',
    )
    .innerJoin('personas', 'personas.persona_version', 'definition_snapshots.persona_version')
    .select([
      'definition_seeds.seeded_at',
      'definition_seeds.source_id',
      'definition_seeds.source_kind',
      'definition_seeds.revision',
      'definition_seeds.content_hash',
      'definition_seeds.format_version',
      'definition_seeds.snapshot_hash',
      'definition_seeds.record_sequence',
      'personas.persona_version',
      'personas.instructions',
    ])
    .orderBy('definition_seeds.seed', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }
  return {
    seededAt: new Date(row.seeded_at),
    sourceID: row.source_id,
    sourceKind: row.source_kind,
    revision: row.revision,
    contentHash: row.content_hash,
    formatVersion: row.format_version,
    snapshotHash: row.snapshot_hash,
    personaVersion: row.persona_version,
    persona: row.instructions,
    recordSequence: row.record_sequence,
  };
}
