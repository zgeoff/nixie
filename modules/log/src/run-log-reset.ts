import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { removeTableRows, withTriggersDropped } from '@heynixie/db';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { KeyStoreTables, Log, LogTables } from './types';
import { withWriteTransaction } from './with-write-transaction';
import { writeKeyStoreCheckpoint } from './write-key-store-checkpoint';

export interface LogReset {
  readonly resetAt: Date;

  readonly lastSequence: number;
}

export interface LogResetOptions<Kept> {
  readonly keptTables: readonly string[];

  readonly readKept: (tx: Transaction<unknown>) => Promise<Kept>;

  readonly writeFirstRecords: (
    tx: Transaction<unknown>,
    kept: Kept,
    reset: LogReset,
  ) => Promise<void>;
}

export async function runLogReset<Kept>(
  log: Log,
  options: LogResetOptions<Kept>,
): Promise<LogReset> {
  await withWriteTransaction(log.writer, () => Promise.resolve());
  await removeRecordKeys(log);

  const reset = await withWriteTransaction(log.writer, (tx) =>
    withTriggersDropped(tx, () => removeLogRows(tx, options)),
  );

  await removeSchemaCopies(log.writer.dataDir);
  await writeCompactFiles(log);

  return reset;
}

async function removeRecordKeys(log: Log): Promise<void> {
  await log.writer.keys.$extendTables<KeyStoreTables>().deleteFrom('record_keys').execute();

  await writeKeyStoreCheckpoint(log, null);
}

const logKeptTables = ['writer_epoch', 'schema_version', 'records'];

// SQLite gives a new row the highest sequence plus 1, so the old last record stays until the first
// new records take the numbers after it, and a device that resumes after it reads them next.
async function removeLogRows<Kept>(
  tx: Transaction<unknown>,
  options: LogResetOptions<Kept>,
): Promise<LogReset> {
  const records = tx.$extendTables<LogTables>();

  const last = await records
    .selectFrom('records')
    .select((eb) => eb.fn.max('sequence').as('sequence'))
    .executeTakeFirst();

  const lastSequence = last?.sequence ?? 0;

  const kept = await options.readKept(tx);

  await removeTableRows(tx, [...logKeptTables, ...options.keptTables]);

  await records.deleteFrom('records').where('sequence', '<', lastSequence).execute();

  const reset = { resetAt: new Date(), lastSequence };

  await options.writeFirstRecords(tx, kept, reset);
  await records.deleteFrom('records').where('sequence', '=', lastSequence).execute();

  return reset;
}

const schemaCopyName = /^nixie-schema-\d+\.db(?:\.partial)?$/u;

async function removeSchemaCopies(dataDir: string): Promise<void> {
  const names = await readdir(dataDir);

  const copies = names.filter((name) => schemaCopyName.test(name));

  await Promise.all(copies.map((name) => rm(join(dataDir, name), { force: true })));
}

async function writeCompactFiles(log: Log): Promise<void> {
  await sql`vacuum`.execute(log.writer.db);
  await sql`pragma wal_checkpoint(truncate)`.execute(log.writer.db);
  await sql`vacuum`.execute(log.writer.keys);

  await writeKeyStoreCheckpoint(log, null);
}
