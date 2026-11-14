import type { Log, RecordKind } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';

// Mapped types, because Kysely's table map needs the index signature that an interface lacks.
type RecordTables = Readonly<{
  records: {
    readonly sequence: number;
    readonly thread: string | null;
    readonly kind: RecordKind;
    readonly key_id: string | null;
  };
}>;

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
