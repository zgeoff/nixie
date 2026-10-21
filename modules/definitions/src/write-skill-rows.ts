import type { Transaction } from 'kysely';
import type { OverlaidSkill } from './build-skill-overlay';
import type { DefinitionsTables, SkillVersion } from './types';

export interface SnapshotSkills {
  readonly snapshotHash: string;

  readonly versions: readonly SkillVersion[];

  readonly skills: readonly OverlaidSkill[];
  readonly conversationSkills: readonly string[];
}

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

        origin: skill.origin === 'nixie' ? 'definitions' : skill.origin,
        in_conversation: inConversation.has(skill.name) ? 1 : 0,
        approval_id: skill.approvalID,
      })),
    )
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}
