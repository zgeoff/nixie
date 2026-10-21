import type { Kysely } from 'kysely';
import type { DefinitionsSkillRef, WrittenSkill } from './build-skill-overlay';
import type { DefinitionsSkillOrigin, DefinitionsTables } from './types';

export interface WrittenSkillEntry extends WrittenSkill {
  readonly proposalID: string;

  readonly definitions: DefinitionsSkillRef | null;
  readonly approvedAt: number;
}

export async function readWrittenSkills(
  db: Kysely<unknown>,
): Promise<readonly WrittenSkillEntry[]> {
  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('written_skills')
    .selectAll()
    .where('state', '=', 'in_force')
    .orderBy('name')
    .execute();

  return rows.map((row) => ({
    approvalID: row.approval_id,
    proposalID: row.proposal_id,
    name: row.name,
    skillHash: row.skill_hash,
    base: toDefinitionsRef(row.name, row.base_hash, row.base_origin),
    definitions: toDefinitionsRef(row.name, row.definitions_hash, row.definitions_origin),
    approvedAt: row.approved_at,
  }));
}

function toDefinitionsRef(
  name: string,
  skillHash: string | null,
  origin: DefinitionsSkillOrigin | null,
): DefinitionsSkillRef | null {
  return skillHash === null || origin === null ? null : { name, skillHash, origin };
}
