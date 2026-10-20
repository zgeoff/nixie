import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { buildDefinitionsSnapshot } from './build-definitions-snapshot';
import type { DefinitionsSkillRef } from './build-skill-overlay';
import { buildSkillOverlay } from './build-skill-overlay';
import { readDefinitionsInForce } from './read-definitions-in-force';
import { readWrittenSkills } from './read-written-skills';
import type { SeedResult } from './run-seed';
import type { DefinitionsTables, SnapshotPolicy } from './types';
import { writeSeed } from './write-seed';

export interface WrittenSkillSeedOptions {
  readonly log: Log;
  readonly policy: SnapshotPolicy;
}

// Seeds the definitions in force again with the written skills as they stand now, without a fresh
// snapshot, so an approval or a retirement takes effect at once. Before the first seed it comes
// back refused.
export function runWrittenSkillSeed(options: WrittenSkillSeedOptions): Promise<SeedResult> {
  return withWriteTransaction(options.log.writer, async (tx) => {
    const inForce = await readDefinitionsInForce(tx);

    if (inForce === null) {
      return { status: 'refused', error: new Error('no definitions are in force yet'), inForce };
    }

    const definitions = await readDefinitionsSkills(tx, inForce.snapshotHash);

    const overlay = buildSkillOverlay({
      skills: definitions.skills,
      conversationSkills: definitions.conversationSkills,
      written: await readWrittenSkills(tx),
    });

    const built = buildDefinitionsSnapshot({
      persona: inForce.persona,
      policy: options.policy,
      skills: overlay.skills,
      conversationSkills: overlay.conversationSkills,
    });

    // an adoption leaves the skills in force as they stand, and the seed still records it
    if (overlay.adopted.length === 0 && built.snapshotHash === inForce.snapshotHash) {
      return { status: 'unchanged', inForce };
    }

    const lists = await readSeedLists(tx, inForce.recordSequence);

    const written = await writeSeed(tx, options.log, {
      source: {
        id: inForce.sourceID,
        kind: inForce.sourceKind,
        revision: inForce.revision,
        contentHash: inForce.contentHash,
      },
      formatVersion: inForce.formatVersion,
      unapplied: lists.unapplied,
      skipped: lists.skipped,
      versions: [],
      overlay,
      built,
      previous: inForce,
    });

    return { status: 'seeded', ...written };
  });
}

// Your definitions' skills under the seed in force: a skill no approval applied stands as it is,
// and a written one gives way to the version of your definitions its store row holds, which takes
// its place on the conversation's list. A new written skill has none beneath it.
async function readDefinitionsSkills(
  tx: Transaction<unknown>,
  snapshotHash: string,
): Promise<{
  readonly skills: readonly DefinitionsSkillRef[];
  readonly conversationSkills: readonly string[];
}> {
  const rows = await tx
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

const seedLists = z.object({
  unapplied: z.array(z.string()).default([]),
  skipped: z.array(z.string()).default([]),
});

type SeedRecordTables = Readonly<{
  records: { readonly sequence: number; readonly payload: string };
}>;

// the paths the seed in force left out and skipped, which the seed it repeats keeps
async function readSeedLists(
  tx: Transaction<unknown>,
  sequence: number,
): Promise<z.infer<typeof seedLists>> {
  const record = await tx
    .$extendTables<SeedRecordTables>()
    .selectFrom('records')
    .select('payload')
    .where('sequence', '=', sequence)
    .executeTakeFirstOrThrow();

  return seedLists.parse(JSON.parse(record.payload));
}
