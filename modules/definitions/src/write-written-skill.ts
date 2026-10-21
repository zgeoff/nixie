import type { Transaction } from 'kysely';
import { readDefinitionsInForce } from './read-definitions-in-force';
import type { DefinitionsTables, SkillVersion } from './types';
import { writeWrittenSkillState } from './write-written-skill-state';

export interface WrittenSkillInput {
  readonly approvalID: string;
  readonly proposalID: string;
  readonly skill: SkillVersion;
  readonly approvedAt: number;
}

export async function writeWrittenSkill(
  tx: Transaction<unknown>,
  input: WrittenSkillInput,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();
  const skill = input.skill;

  await tables
    .insertInto('skill_versions')
    .values({
      skill_hash: skill.skillHash,
      name: skill.name,
      frontmatter: JSON.stringify(skill.frontmatter),
      files: JSON.stringify(Object.fromEntries(skill.files)),
    })
    .onConflict((conflict) => conflict.doNothing())
    .execute();

  const previous = await tables
    .selectFrom('written_skills')
    .select(['approval_id', 'base_hash', 'base_origin', 'definitions_hash', 'definitions_origin'])
    .where('name', '=', skill.name)
    .where('state', '=', 'in_force')
    .executeTakeFirst();

  if (previous !== undefined) {
    await writeWrittenSkillState(tx, {
      approvalID: previous.approval_id,
      to: 'superseded',
      at: input.approvedAt,
    });
  }

  const definitionsBase = await readDefinitionsBase(tx, skill.name);

  const base = previous ?? definitionsBase;

  await tables
    .insertInto('written_skills')
    .values({
      approval_id: input.approvalID,
      proposal_id: input.proposalID,
      name: skill.name,
      skill_hash: skill.skillHash,
      state: 'in_force',
      base_hash: base.base_hash,
      base_origin: base.base_origin,
      definitions_hash: base.definitions_hash,
      definitions_origin: base.definitions_origin,
      approved_at: input.approvedAt,
      updated_at: input.approvedAt,
    })
    .execute();
}

async function readDefinitionsBase(tx: Transaction<unknown>, name: string) {
  const inForce = await readDefinitionsInForce(tx);

  const row =
    inForce === null
      ? undefined
      : await tx
          .$extendTables<DefinitionsTables>()
          .selectFrom('snapshot_skills')
          .select(['skill_hash', 'origin'])
          .where('snapshot_hash', '=', inForce.snapshotHash)
          .where('name', '=', name)
          .where('approval_id', 'is', null)
          .executeTakeFirst();

  return {
    base_hash: row?.skill_hash ?? null,
    base_origin: row?.origin ?? null,
    definitions_hash: row?.skill_hash ?? null,
    definitions_origin: row?.origin ?? null,
  };
}
