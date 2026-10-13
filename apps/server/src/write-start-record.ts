import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { z } from 'zod';
import { nixieVersion } from './nixie-version';

// Records that nixie started, with its version and the version of the start before it, so the
// conversation hears of a restart and of the release it brought. The first start has no previous
// version.
export function writeStartRecord(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  version: string = nixieVersion,
): Promise<void> {
  const log = context.log;

  return withWriteTransaction(log.writer, async (tx) => {
    const previous = await tx
      .$extendTables<RecordTables>()
      .selectFrom('records')
      .select('payload')
      .where('kind', '=', 'server.started')
      .orderBy('sequence', 'desc')
      .limit(1)
      .executeTakeFirst();
    const payload: unknown = previous === undefined ? null : JSON.parse(previous.payload);
    const parsed = startPayload.safeParse(payload);

    await writeRecordsInTransaction(tx, log, [
      {
        kind: 'server.started',
        definitions: context.definitions(),
        payload: { version, previousVersion: parsed.data?.version ?? null },
      },
    ]);
  });
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
type RecordTables = Readonly<{
  records: { readonly sequence: number; readonly kind: string; readonly payload: string };
}>;

const startPayload = z.object({ version: z.string() });
