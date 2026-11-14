import { sql } from 'kysely';
import { withWriteTransaction } from '../record/with-write-transaction';
import type { ErasableRecordKind } from '../types';
import type { LogSeederDeps } from './log-seeder-deps';
import { seedRecord } from './seed-record';

export interface DriftedThreadSeed {
  readonly kind: ErasableRecordKind;
  readonly thread: string;
}

export async function seedDriftedThread(
  deps: LogSeederDeps,
  input: DriftedThreadSeed,
): Promise<void> {
  await seedRecord(deps, input);

  // A thread row whose record count disagrees with a rebuild from its records: the folds never
  // write one.
  await withWriteTransaction(deps.log.writer, async (tx) => {
    await sql`update threads set record_count = record_count + 8 where thread = ${input.thread}`.execute(
      tx,
    );
  });
}
