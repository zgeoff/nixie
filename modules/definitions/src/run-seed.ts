import type { Log, LogRecord } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { buildDefinitionsSnapshot } from './build-definitions-snapshot';
import { findDefinitionsInForce } from './find-definitions-in-force';
import { parseDefinitions } from './parse-definitions';
import type {
  DefinitionsInForce,
  DefinitionsSnapshot,
  DefinitionsSource,
  DefinitionsTables,
  ParsedDefinitions,
  Snapshot,
  SnapshotPolicy,
} from './types';

export interface SeedOptions {
  readonly log: Log;
  readonly source: DefinitionsSource;

  // the policy in force, which the composition root builds from the fixed rule and the registry
  readonly policy: SnapshotPolicy;
}

// seeded: a new seed is in force. unchanged: the newest seed already holds these definitions.
// refused: the snapshot failed to read, parse or validate, and the last seed stays in force.
export type SeedResult =
  | {
      readonly status: 'seeded';
      readonly inForce: DefinitionsInForce;
      readonly record: LogRecord;
    }
  | { readonly status: 'unchanged'; readonly inForce: DefinitionsInForce }
  | {
      readonly status: 'refused';
      readonly error: Error;
      readonly inForce: DefinitionsInForce | null;
    };

// Seeds a snapshot in one write transaction. A snapshot that fails to read or parse comes back
// refused, never thrown, and the last seed stays in force. The caller runs one seed at a time, so
// an older revision never commits after a newer one.
export async function runSeed(options: SeedOptions): Promise<SeedResult> {
  const read = await tryReadDefinitions(options.source);

  if (read instanceof Error) {
    const inForce = await findDefinitionsInForce(options.log.writer.db);

    return { status: 'refused', error: read, inForce };
  }
  const built = buildDefinitionsSnapshot({ persona: read.parsed.persona, policy: options.policy });

  return withWriteTransaction(options.log.writer, async (tx) => {
    const inForce = await findDefinitionsInForce(tx);

    if (inForce !== null && isSameSeed(inForce, { ...read, built, sourceID: options.source.id })) {
      return { status: 'unchanged', inForce };
    }
    return applySeed(tx, options, { ...read, built });
  });
}

interface ReadDefinitions {
  readonly snapshot: Snapshot;
  readonly parsed: ParsedDefinitions;
}

async function tryReadDefinitions(source: DefinitionsSource): Promise<ReadDefinitions | Error> {
  try {
    const snapshot = await source.snapshot();

    return { snapshot, parsed: parseDefinitions(snapshot) };
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

interface SeedPlan extends ReadDefinitions {
  readonly built: DefinitionsSnapshot;
}

function isSameSeed(
  inForce: DefinitionsInForce,
  plan: SeedPlan & { readonly sourceID: string },
): boolean {
  return (
    inForce.sourceID === plan.sourceID &&
    inForce.revision === plan.snapshot.revision &&
    inForce.contentHash === plan.snapshot.contentHash &&
    inForce.snapshotHash === plan.built.snapshotHash
  );
}

async function applySeed(
  tx: Transaction<unknown>,
  options: SeedOptions,
  plan: SeedPlan,
): Promise<SeedResult> {
  const seededAt = Date.now();

  await writeSnapshotRows(tx, plan, seededAt);

  const record = await writeSeedRecord(tx, options, plan);
  const inForce: DefinitionsInForce = {
    seededAt: new Date(seededAt),
    sourceID: options.source.id,
    sourceKind: options.source.kind,
    revision: plan.snapshot.revision,
    contentHash: plan.snapshot.contentHash,
    formatVersion: plan.parsed.formatVersion,
    snapshotHash: plan.built.snapshotHash,
    personaVersion: plan.built.personaVersion,
    persona: plan.built.persona,
    recordSequence: record.sequence,
  };

  await writeSeedRow(tx, inForce);
  return { status: 'seeded', record, inForce };
}

// a persona or a snapshot seen before keeps its first row, and with it its first label
async function writeSnapshotRows(
  tx: Transaction<unknown>,
  plan: SeedPlan,
  seededAt: number,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

  await tables
    .insertInto('personas')
    .values({ persona_version: plan.built.personaVersion, instructions: plan.built.persona })
    .onConflict((conflict) => conflict.doNothing())
    .execute();
  await tables
    .insertInto('definition_snapshots')
    .values({
      snapshot_hash: plan.built.snapshotHash,
      persona_version: plan.built.personaVersion,
      policy_hash: plan.built.policyHash,
      form: plan.built.form,
      label: plan.snapshot.revision,
      created_at: seededAt,
    })
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}

async function writeSeedRecord(
  tx: Transaction<unknown>,
  options: SeedOptions,
  plan: SeedPlan,
): Promise<LogRecord> {
  const [record] = await writeRecordsInTransaction(tx, options.log, [
    {
      kind: 'definitions_seeded',
      definitions: {
        snapshotHash: plan.built.snapshotHash,
        personaVersion: plan.built.personaVersion,
      },
      payload: {
        sourceID: options.source.id,
        sourceKind: options.source.kind,
        revision: plan.snapshot.revision,
        contentHash: plan.snapshot.contentHash,
        formatVersion: plan.parsed.formatVersion,
        policyHash: plan.built.policyHash,
        unapplied: plan.parsed.unapplied,
        skipped: plan.snapshot.skipped,
      },
    },
  ]);

  if (record === undefined) {
    throw new Error('the log wrote no definitions_seeded record');
  }
  return record;
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
