import type { Kysely } from 'kysely';
import type { DefinitionsTables, ParsedSkill, SkillFrontmatter } from './types';

// Loads every skill a snapshot holds, with its files, in name order; none for a snapshot without
// skills.
export async function loadSnapshotSkills(
  db: Kysely<unknown>,
  snapshotHash: string,
): Promise<readonly ParsedSkill[]> {
  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('snapshot_skills')
    .innerJoin('skill_versions', 'skill_versions.skill_hash', 'snapshot_skills.skill_hash')
    .select([
      'snapshot_skills.name',
      'snapshot_skills.skill_hash',
      'snapshot_skills.origin',
      'skill_versions.frontmatter',
      'skill_versions.files',
    ])
    .where('snapshot_skills.snapshot_hash', '=', snapshotHash)
    .orderBy('snapshot_skills.name')
    .execute();

  return rows.map((row) => ({
    name: row.name,
    skillHash: row.skill_hash,
    origin: row.origin,

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the seed wrote the frontmatter
    frontmatter: JSON.parse(row.frontmatter) as SkillFrontmatter,

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the seed wrote the files
    files: new Map(Object.entries(JSON.parse(row.files) as Record<string, string>)),
  }));
}
