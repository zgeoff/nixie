import type { Transaction } from 'kysely';
import type { DefinitionsSkillRef, WrittenSkill } from './build-skill-overlay';
import type { DefinitionsTables } from './types';
import { writeSkillExportState } from './write-skill-export-state';
import { writeWrittenSkillState } from './write-written-skill-state';

// the written skills a seed adopts, your definitions' skills, and when
export interface AdoptedSkillsInput {
  readonly adopted: readonly WrittenSkill[];
  readonly skills: readonly DefinitionsSkillRef[];
  readonly at: number;
}

// Marks each written skill your definitions now hold as yours, inside the caller's write
// transaction. Every adopted skill records the version of your definitions it became, and the
// opened exports of its approvals close, so an adoption that lacks either gets it at the next seed.
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

  await writeAdoptedExportsClosed(tx, [...new Set(rows.map((row) => row.name))], input.at);
}

// The pull request of an adopted skill merged, so the export of each approval of it that no longer
// stands in force closes; the pull request needs no close on the repo. An export in flight may
// still open a pull request, so the export sweep closes it instead.
async function writeAdoptedExportsClosed(
  tx: Transaction<unknown>,
  names: readonly string[],
  at: number,
): Promise<void> {
  if (names.length === 0) {
    return;
  }

  const open = await tx
    .$extendTables<DefinitionsTables>()
    .selectFrom('written_skills as written')
    .leftJoin('skill_exports as export', 'export.approval_id', 'written.approval_id')
    .leftJoin('skill_export_attempts as attempt', 'attempt.approval_id', 'written.approval_id')
    .select('written.approval_id')
    .where('written.name', 'in', names)
    .where('written.state', 'in', ['adopted', 'superseded'])
    .where('export.state', '=', 'opened')
    .where('attempt.approval_id', 'is', null)
    .execute();

  for (const row of open) {
    await writeSkillExportState(tx, {
      approvalID: row.approval_id,
      to: 'closed',
      pullRequest: null,
      at,
    });
  }
}
