import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { buildDefinitionsSnapshot } from './build-definitions-snapshot';
import { buildSkillOverlay } from './build-skill-overlay';
import { readDefinitionsInForce } from './read-definitions-in-force';
import { readDefinitionsSkills } from './read-definitions-skills';
import { readWrittenSkills } from './read-written-skills';
import type { SeedResult } from './run-seed';
import type { SnapshotPolicy } from './types';
import { writeAdoptedSkills } from './write-adopted-skills';
import { writeSeed } from './write-seed';

export interface WrittenSkillSeedOptions {
  readonly log: Log;
  readonly policy: SnapshotPolicy;
}

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

    await writeAdoptedSkills(tx, {
      adopted: overlay.adopted,
      skills: definitions.skills,
      at: options.log.writer.clock.now(),
    });

    if (overlay.adopted.length === 0 && built.snapshotHash === inForce.snapshotHash) {
      return { status: 'unchanged', inForce };
    }

    const lists = await readSeedLists(tx, inForce.recordSequence);

    const written = await writeSeed(tx, options.log, {
      source: {
        id: inForce.sourceID,
        kind: inForce.sourceKind,
        repository: inForce.sourceRepository,
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

const seedLists = z.object({
  unapplied: z.array(z.string()).default([]),
  skipped: z.array(z.string()).default([]),
});

type SeedRecordTables = Readonly<{
  records: { readonly sequence: number; readonly payload: string };
}>;

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
