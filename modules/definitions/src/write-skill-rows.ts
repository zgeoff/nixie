import type { Transaction } from 'kysely';
import type { OverlaidSkill } from './build-skill-overlay';
import type { DefinitionsTables, SkillVersion } from './types';

export interface SnapshotSkills {
  readonly snapshotHash: string;

  // the skill versions to keep, which every skill the snapshot holds needs
  readonly versions: readonly SkillVersion[];

  // the skills the snapshot holds, each with the approval that applied it when nixie wrote it
  readonly skills: readonly OverlaidSkill[];
  readonly conversationSkills: readonly string[];
}

// Writes each skill's version under its content hash and the snapshot's list of skills, each
// marked when the conversation's list holds it. A version or a snapshot seen before keeps its
// first rows, because the hashes cover what the rows hold.
export async function writeSkillRows(
  tx: Transaction<unknown>,
  snapshot: SnapshotSkills,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

  const inConversation = new Set(snapshot.conversationSkills);

  if (snapshot.versions.length > 0) {
    await tables
      .insertInto('skill_versions')
      .values(
        snapshot.versions.map((skill) => ({
          skill_hash: skill.skillHash,
          name: skill.name,
          frontmatter: JSON.stringify(skill.frontmatter),
          files: JSON.stringify(Object.fromEntries(skill.files)),
        })),
      )
      .onConflict((conflict) => conflict.doNothing())
      .execute();
  }

  if (snapshot.skills.length === 0) {
    return;
  }

  await tables
    .insertInto('snapshot_skills')
    .values(
      snapshot.skills.map((skill) => ({
        snapshot_hash: snapshot.snapshotHash,
        name: skill.name,
        skill_hash: skill.skillHash,

        // the approval marks a skill that nixie wrote, and its row keeps the plain origin
        origin: skill.origin === 'nixie' ? 'definitions' : skill.origin,
        in_conversation: inConversation.has(skill.name) ? 1 : 0,
        approval_id: skill.approvalID,
      })),
    )
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}
