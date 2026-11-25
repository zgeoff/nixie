import { withWriteTransaction } from '@heynixie/log';
import type { CodingContext, CodingTables, StartCursorStore } from '../types';

// The queue stops resending a start under its key after 23 hours, so a cursor older than a day
// can never be asked for again.
const keptMs = 24 * 60 * 60 * 1000;

// The cursors that one adapter's starts read, kept in the database so a restart loses none.
export function buildStartCursorStore(
  context: CodingContext,
  adapterID: string,
  now: () => number,
): StartCursorStore {
  return {
    read: async (idempotencyKey) => {
      const row = await context.tasks.log.writer.db
        .$extendTables<CodingTables>()
        .selectFrom('coding_start_cursors')
        .select('cursor')
        .where('adapter', '=', adapterID)
        .where('idempotency_key', '=', idempotencyKey)
        .executeTakeFirst();

      return row?.cursor ?? null;
    },
    write: (idempotencyKey, cursor) =>
      withWriteTransaction(context.tasks.log.writer, async (tx) => {
        const table = tx.$extendTables<CodingTables>();
        const nowMs = now();

        await table
          .deleteFrom('coding_start_cursors')
          .where('written_at', '<', nowMs - keptMs)
          .execute();

        await table
          .insertInto('coding_start_cursors')
          .values({
            adapter: adapterID,
            idempotency_key: idempotencyKey,
            cursor,
            written_at: nowMs,
          })
          .onConflict((conflict) => conflict.doNothing())
          .execute();
      }),
    remove: (idempotencyKey) =>
      withWriteTransaction(context.tasks.log.writer, async (tx) => {
        await tx
          .$extendTables<CodingTables>()
          .deleteFrom('coding_start_cursors')
          .where('adapter', '=', adapterID)
          .where('idempotency_key', '=', idempotencyKey)
          .execute();
      }),
  };
}
