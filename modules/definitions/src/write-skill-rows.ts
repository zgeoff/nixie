import type { Transaction } from 'kysely';
import type { DefinitionsTables, ParsedSkill } from './types';

// Writes each skill's version under its content hash and the snapshot's list of skills. A version
// or a snapshot seen before keeps its first rows, because the hashes cover what the rows hold.
export async function writeSkillRows(
  tx: Transaction<unknown>,
  snapshotHash: string,
  skills: readonly ParsedSkill[],
): Promise<void> {
  if (skills.length === 0) {
    return;
  }

  const tables = tx.$extendTables<DefinitionsTables>();

  await tables
    .insertInto('skill_versions')
    .values(
      skills.map((skill) => ({
        skill_hash: skill.skillHash,
        name: skill.name,
        frontmatter: JSON.stringify(skill.frontmatter),
        files: JSON.stringify(Object.fromEntries(skill.files)),
      })),
    )
    .onConflict((conflict) => conflict.doNothing())
    .execute();

  await tables
    .insertInto('snapshot_skills')
    .values(
      skills.map((skill) => ({
        snapshot_hash: snapshotHash,
        name: skill.name,
        skill_hash: skill.skillHash,
        origin: skill.origin,
      })),
    )
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}
