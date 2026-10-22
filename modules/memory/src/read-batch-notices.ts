import type { Log, LogTables } from '@heynixie/log';
import { z } from 'zod';
import type { VersionRef } from './types';

export interface BatchNotice {
  readonly sequence: number;
  readonly notice: 'batch' | 'catch_up';
  readonly versions: readonly VersionRef[];
  readonly count: number;
}

const versionSchema = z.object({ itemID: z.string(), version: z.int() });

const payloadSchema = z.object({
  notice: z.enum(['batch', 'catch_up']),
  versions: z.array(versionSchema),
  count: z.int(),
});

export async function readBatchNotices(
  log: Pick<Log, 'writer'>,
  thread: string,
): Promise<readonly BatchNotice[]> {
  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(['sequence', 'payload'])
    .where('kind', '=', 'memory.notice')
    .where('thread', '=', thread)
    .orderBy('sequence')
    .execute();

  return rows.map((row) => {
    const payload = payloadSchema.parse(JSON.parse(row.payload));

    return {
      sequence: row.sequence,
      notice: payload.notice,
      versions: payload.versions,
      count: payload.count,
    };
  });
}
