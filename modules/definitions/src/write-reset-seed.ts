import type { Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import type { ResetSeed } from './read-reset-seed';
import type { DefinitionsInForce, DefinitionsTables } from './types';
import { writeSkillRows } from './write-skill-rows';

// Seeds the definitions in force again as the first record of a reset log, inside the reset's
// transaction, with the payload of the seed it repeats, so the next start finds them unchanged.
export async function writeResetSeed(
  tx: Transaction<unknown>,
  log: Log,
  seed: ResetSeed,
): Promise<DefinitionsInForce> {
  await writeSnapshotRows(tx, seed);

  await writeSkillRows(tx, {
    snapshotHash: seed.inForce.snapshotHash,
    skills: seed.skills,
    conversationSkills: seed.inForce.conversationSkills,
  });

  const [record] = await writeRecordsInTransaction(tx, log, [
    {
      kind: 'definitions_seeded',
      definitions: {
        snapshotHash: seed.inForce.snapshotHash,
        personaVersion: seed.inForce.personaVersion,
      },
      payload: seed.payload,
    },
  ]);

  // the log writes one record for each input
  invariant(record);

  const inForce = { ...seed.inForce, seededAt: new Date(), recordSequence: record.sequence };

  await writeSeedRow(tx, inForce);

  return inForce;
}

async function writeSnapshotRows(tx: Transaction<unknown>, seed: ResetSeed): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

  await tables
    .insertInto('personas')
    .values({ persona_version: seed.inForce.personaVersion, instructions: seed.inForce.persona })
    .execute();

  await tables
    .insertInto('definition_snapshots')
    .values({
      snapshot_hash: seed.inForce.snapshotHash,
      persona_version: seed.inForce.personaVersion,
      policy_hash: seed.policyHash,
      form: seed.form,
      label: seed.label,
      created_at: seed.createdAt,
    })
    .execute();
}

async function writeSeedRow(tx: Transaction<unknown>, inForce: DefinitionsInForce): Promise<void> {
  await tx
    .$extendTables<DefinitionsTables>()
    .insertInto('definition_seeds')
    .values({
      seeded_at: inForce.seededAt.getTime(),
      source_id: inForce.sourceID,
      source_kind: inForce.sourceKind,
      revision: inForce.revision,
      content_hash: inForce.contentHash,
      format_version: inForce.formatVersion,
      snapshot_hash: inForce.snapshotHash,
      record_sequence: inForce.recordSequence,
    })
    .execute();
}
