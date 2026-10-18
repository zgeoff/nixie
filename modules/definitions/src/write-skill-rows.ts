import type { Transaction } from 'kysely';
import type { DefinitionsTables, ParsedSkill } from './types';

// Writes each skill's version under its content hash and the snapshot's list of skills, each
// marked when the conversation's list holds it. A version or a snapshot seen before keeps its
// first rows, because the hashes cover what the rows hold.
export async function writeSkillRows(
  tx: Transaction<unknown>,
  snapshot: SnapshotSkills,
): Promise<void> {
  if (snapshot.skills.length === 0) {
    return;
  }

  const tables = tx.$extendTables<DefinitionsTables>();

  const inConversation = new Set(snapshot.conversationSkills);

  await tables
    .insertInto('skill_versions')
    .values(
      snapshot.skills.map((skill) => ({
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
      snapshot.skills.map((skill) => ({
        snapshot_hash: snapshot.snapshotHash,
        name: skill.name,
        skill_hash: skill.skillHash,
        origin: skill.origin,
        in_conversation: inConversation.has(skill.name) ? 1 : 0,
      })),
    )
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}

export interface SnapshotSkills {
  readonly snapshotHash: string;
  readonly skills: readonly ParsedSkill[];
  readonly conversationSkills: readonly string[];
}
