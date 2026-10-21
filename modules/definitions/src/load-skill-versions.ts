import type { Kysely } from 'kysely';
import { storedSkillFilesSchema } from './stored-skill-files-schema';
import { storedSkillFrontmatterSchema } from './stored-skill-frontmatter-schema';
import type { DefinitionsTables, SkillVersion } from './types';

export async function loadSkillVersions(
  db: Kysely<unknown>,
  skillHashes: readonly string[],
): Promise<ReadonlyMap<string, SkillVersion>> {
  if (skillHashes.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('skill_versions')
    .select(['skill_hash', 'name', 'frontmatter', 'files'])
    .where('skill_hash', 'in', [...new Set(skillHashes)])
    .execute();

  return new Map(
    rows.map((row) => [
      row.skill_hash,
      {
        name: row.name,
        skillHash: row.skill_hash,
        frontmatter: storedSkillFrontmatterSchema.parse(JSON.parse(row.frontmatter)),
        files: storedSkillFilesSchema.parse(JSON.parse(row.files)),
      },
    ]),
  );
}
