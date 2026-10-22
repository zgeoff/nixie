import type { Kysely } from 'kysely';
import type { DefinitionsInForce, DefinitionsTables } from './types';

export async function readDefinitionsInForce(
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
      'definition_seeds.source_repository',
      'definition_seeds.revision',
      'definition_seeds.content_hash',
      'definition_seeds.format_version',
      'definition_seeds.snapshot_hash',
      'definition_seeds.record_sequence',
      'personas.persona_version',
      'personas.instructions',
      'definition_snapshots.policy_hash',
    ])
    .orderBy('definition_seeds.seed', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const skills = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('snapshot_skills')
    .select(['name', 'skill_hash', 'origin', 'in_conversation', 'approval_id'])
    .where('snapshot_hash', '=', row.snapshot_hash)
    .orderBy('name')
    .execute();

  return {
    seededAt: new Date(row.seeded_at),
    sourceID: row.source_id,
    sourceKind: row.source_kind,
    sourceRepository: row.source_repository,
    revision: row.revision,
    contentHash: row.content_hash,
    formatVersion: row.format_version,
    snapshotHash: row.snapshot_hash,
    personaVersion: row.persona_version,
    persona: row.instructions,
    policyHash: row.policy_hash,
    recordSequence: row.record_sequence,
    skills: skills.map((skill) => ({
      name: skill.name,
      skillHash: skill.skill_hash,
      origin: skill.approval_id === null ? skill.origin : 'nixie',
    })),
    conversationSkills: skills
      .filter((skill) => skill.in_conversation === 1)
      .map((skill) => skill.name),
  };
}
