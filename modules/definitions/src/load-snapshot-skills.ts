import type { Kysely } from 'kysely';
import type { OverlaidSkill } from './build-skill-overlay';
import { storedSkillFilesSchema } from './stored-skill-files-schema';
import { storedSkillFrontmatterSchema } from './stored-skill-frontmatter-schema';
import type { DefinitionsTables, SkillVersion } from './types';

// A skill a snapshot holds, with its files, and the approval that applied it when nixie wrote it.
export type SnapshotSkill = SkillVersion & OverlaidSkill;

// Loads every skill a snapshot holds, with its files, in name order; none for a snapshot without
// skills.
export async function loadSnapshotSkills(
  db: Kysely<unknown>,
  snapshotHash: string,
): Promise<readonly SnapshotSkill[]> {
  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('snapshot_skills')
    .innerJoin('skill_versions', 'skill_versions.skill_hash', 'snapshot_skills.skill_hash')
    .select([
      'snapshot_skills.name',
      'snapshot_skills.skill_hash',
      'snapshot_skills.origin',
      'snapshot_skills.approval_id',
      'skill_versions.frontmatter',
      'skill_versions.files',
    ])
    .where('snapshot_skills.snapshot_hash', '=', snapshotHash)
    .orderBy('snapshot_skills.name')
    .execute();

  return rows.map((row) => ({
    name: row.name,
    skillHash: row.skill_hash,
    origin: row.approval_id === null ? row.origin : 'nixie',
    approvalID: row.approval_id,
    frontmatter: storedSkillFrontmatterSchema.parse(JSON.parse(row.frontmatter)),
    files: storedSkillFilesSchema.parse(JSON.parse(row.files)),
  }));
}
