import type { Log } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';

// mapped types, because Kysely's table map needs the index signature an interface lacks
type RecordTables = Readonly<{
  records: {
    readonly sequence: number;
    readonly thread: string | null;
    readonly kind: string;
    readonly key_id: string | null;
  };
}>;

// Deletes the key of every summary on the thread, one at a time, each with its key store
// checkpoint, so every summary reads as shredded. A key a forget already deleted deletes again as a
// no-op, so a rerun is safe.
export async function removeSummaryKeys(log: Pick<Log, 'writer'>, taskID: string): Promise<void> {
  const rows = await log.writer.db
    .$extendTables<RecordTables>()
    .selectFrom('records')
    .select('key_id')
    .where('thread', '=', taskID)
    .where('kind', '=', 'model.session_summarized')
    .where('key_id', 'is not', null)
    .orderBy('sequence')
    .execute();

  await rows.reduce(
    (removed, row) =>
      removed.then(() => (row.key_id === null ? undefined : removeRecordKey(log, row.key_id))),
    Promise.resolve(),
  );
}
