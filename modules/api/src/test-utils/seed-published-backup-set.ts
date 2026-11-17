import type { Writer } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';

export interface PublishedBackupSet {
  readonly sequence: number;

  // the head of the log when the set's copy started
  readonly logHead: number;
}

export async function seedPublishedBackupSet(
  writer: Writer,
  set: PublishedBackupSet,
): Promise<void> {
  await withWriteTransaction(writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (${set.sequence}, 'scheduled', 'published', ${set.logHead}, 1798761500000)`.execute(
      tx,
    );
  });
}
