import type { Kysely } from 'kysely';
import type { DefinitionsSkillRef } from './build-skill-overlay';
import type { DefinitionsTables } from './types';

export interface DefinitionsSkills {
  readonly skills: readonly DefinitionsSkillRef[];
  readonly conversationSkills: readonly string[];
}

export async function readDefinitionsSkills(
  db: Kysely<unknown>,
  snapshotHash: string,
): Promise<DefinitionsSkills> {
  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('snapshot_skills')
    .leftJoin('written_skills', 'written_skills.approval_id', 'snapshot_skills.approval_id')
    .select([
      'snapshot_skills.name',
      'snapshot_skills.skill_hash',
      'snapshot_skills.origin',
      'snapshot_skills.in_conversation',
      'snapshot_skills.approval_id',
      'written_skills.definitions_hash',
      'written_skills.definitions_origin',
    ])
    .where('snapshot_skills.snapshot_hash', '=', snapshotHash)
    .orderBy('snapshot_skills.name')
    .execute();

  const skills = rows.flatMap((row): readonly (DefinitionsSkillRef & { isListed: boolean })[] => {
    const isListed = row.in_conversation === 1;

    if (row.approval_id === null) {
      return [{ name: row.name, skillHash: row.skill_hash, origin: row.origin, isListed }];
    }

    return row.definitions_hash === null || row.definitions_origin === null
      ? []
      : [
          {
            name: row.name,
            skillHash: row.definitions_hash,
            origin: row.definitions_origin,
            isListed,
          },
        ];
  });

  return {
    skills: skills.map((skill) => ({
      name: skill.name,
      skillHash: skill.skillHash,
      origin: skill.origin,
    })),
    conversationSkills: skills.filter((skill) => skill.isListed).map((skill) => skill.name),
  };
}
