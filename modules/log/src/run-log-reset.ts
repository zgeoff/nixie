import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { removeTableRows, withTriggersDropped } from '@heynixie/db';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { KeyStoreTables, Log, LogTables } from './types';
import { withWriteTransaction } from './with-write-transaction';
import { writeKeyStoreCheckpoint } from './write-key-store-checkpoint';

export interface LogResetOptions<Kept> {
  // the tables whose rows the reset keeps beside the writer epoch and the schema version, such as
  // the identity record
  readonly keptTables: readonly string[];

  // reads what the new log carries over, such as the live sessions, inside the wipe's transaction
  // and before any delete
  readonly readKept: (tx: Transaction<unknown>) => Promise<Kept>;

  // writes the first records of the new log inside the wipe's transaction, after every delete
  readonly writeFirstRecords: (
    tx: Transaction<unknown>,
    kept: Kept,
    reset: LogReset,
  ) => Promise<void>;
}

export interface LogReset {
  readonly resetAt: Date;

  // the highest sequence of the old log, or 0 when it held no record
  readonly lastSequence: number;
}

// Removes every record, projection row and record key: the one exception to the append-only log.
// Keys go first, so a crash after them leaves shredded text that a second reset finishes. One
// transaction deletes the rows and writes the new log's first records, behind the epoch check.
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

// the checkpoint moves every frame out of the key store's WAL, so no deleted key stays on disk
async function removeRecordKeys(log: Log): Promise<void> {
  await log.writer.keys.$extendTables<KeyStoreTables>().deleteFrom('record_keys').execute();
  await writeKeyStoreCheckpoint(log, null);
}

// SQLite gives a new row the highest sequence plus 1, so the old last record stays until the first
// new records have taken the numbers after it. A device that resumes after the last sequence it saw
// therefore reads the new records next.
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

// the writer's own rows, and the records, which the reset removes around the first new ones
const logKeptTables = ['writer_epoch', 'schema_version', 'records'];

// the copies the migration runner takes before a migration, finished or cut short
async function removeSchemaCopies(dataDir: string): Promise<void> {
  const names = await readdir(dataDir);
  const copies = names.filter((name) => schemaCopyName.test(name));

  await Promise.all(copies.map((name) => rm(join(dataDir, name), { force: true })));
}

const schemaCopyName = /^nixie-schema-\d+\.db(?:\.partial)?$/u;

// a vacuum rebuilds the file from its live pages, and the checkpoint moves the rebuilt pages out
// of the WAL and truncates it
async function writeCompactFiles(log: Log): Promise<void> {
  await sql`vacuum`.execute(log.writer.db);
  await sql`pragma wal_checkpoint(truncate)`.execute(log.writer.db);
  await sql`vacuum`.execute(log.writer.keys);
  await writeKeyStoreCheckpoint(log, null);
}
