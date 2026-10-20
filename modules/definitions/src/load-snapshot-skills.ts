import type { Kysely } from 'kysely';
import { storedSkillFilesSchema } from './stored-skill-files-schema';
import { storedSkillFrontmatterSchema } from './stored-skill-frontmatter-schema';
import type { DefinitionsTables, ParsedSkill } from './types';

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
    frontmatter: storedSkillFrontmatterSchema.parse(JSON.parse(row.frontmatter)),
    files: storedSkillFilesSchema.parse(JSON.parse(row.files)),
  }));
}
