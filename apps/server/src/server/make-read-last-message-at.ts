import type { Log, LogTables } from '@heynixie/log';
import type { TasksRecordKind } from '@heynixie/tasks';

const ownerMessageKind: TasksRecordKind = 'owner_message';

// Reads the time of the newest owner message, which an idle window measures its quiet from, or null
// when the owner has sent none.
export function makeReadLastMessageAt(writer: Log['writer']): () => Promise<number | null> {
  return async () => {
    const row = await writer.db
      .$extendTables<LogTables>()
      .selectFrom('records')
      .select('recorded_at')
      .where('kind', '=', ownerMessageKind)
      .orderBy('sequence', 'desc')
      .limit(1)
      .executeTakeFirst();

    return row?.recorded_at ?? null;
  };
}
