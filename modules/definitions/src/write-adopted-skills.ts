import type { Transaction } from 'kysely';
import type { DefinitionsSkillRef, WrittenSkill } from './build-skill-overlay';
import type { DefinitionsTables } from './types';
import { writeWrittenSkillState } from './write-written-skill-state';

export interface AdoptedSkillsInput {
  readonly adopted: readonly WrittenSkill[];
  readonly skills: readonly DefinitionsSkillRef[];
  readonly at: number;
}

// The export sweep, which runs one at a time, closes the export of each approval that leaves force,
// so a seed never moves an export in flight.
export async function writeAdoptedSkills(
  tx: Transaction<unknown>,
  input: AdoptedSkillsInput,
): Promise<void> {
  for (const written of input.adopted) {
    await writeWrittenSkillState(tx, {
      approvalID: written.approvalID,
      to: 'adopted',
      at: input.at,
    });
  }

  const tables = tx.$extendTables<DefinitionsTables>();

  const rows = await tables
    .selectFrom('written_skills')
    .select(['approval_id', 'name', 'skill_hash', 'definitions_hash', 'definitions_origin'])
    .where('state', '=', 'adopted')
    .execute();

  for (const row of rows) {
    const definitions = input.skills.find(
      (skill) => skill.name === row.name && skill.skillHash === row.skill_hash,
    );

    if (
      definitions !== undefined &&
      (row.definitions_hash !== definitions.skillHash ||
        row.definitions_origin !== definitions.origin)
    ) {
      await tables
        .updateTable('written_skills')
        .set({
          definitions_hash: definitions.skillHash,
          definitions_origin: definitions.origin,
          updated_at: input.at,
        })
        .where('approval_id', '=', row.approval_id)
        .execute();
    }
  }
}
