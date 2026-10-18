import type { Kysely } from 'kysely';
import type { DefinitionsTables, SkillFrontmatter, SkillVersion } from './types';

// The skill versions under the given content hashes, by hash. A hash with no version is missing
// from the result, which only a hash from outside the seed can give.
export async function findSkillVersions(
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

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the seed wrote the frontmatter
        frontmatter: JSON.parse(row.frontmatter) as SkillFrontmatter,

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the seed wrote the files
        files: new Map(Object.entries(JSON.parse(row.files) as Record<string, string>)),
      },
    ]),
  );
}
