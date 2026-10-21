import type { LogTables } from '@heynixie/log';
import { parseJSONObject } from '@heynixie/log';
import { memoryRecalledCodec } from '@heynixie/sessions';
import { sql } from 'kysely';
import { MemoryRatingError } from './memory-rating-error';
import type { StoreParts } from './types';

export interface LatestRecall {
  readonly sequence: number;

  readonly versions: ReadonlyMap<string, number>;
}

export async function readLatestRecall(parts: StoreParts, thread: string): Promise<LatestRecall> {
  const newest = await parts.context.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(['sequence', 'payload'])
    .where('kind', '=', 'memory.recalled')
    .where('thread', '=', thread)
    .where(sql`json_extract(records.payload, '$.isTurnNote')`, 'is', null)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (newest === undefined) {
    throw new MemoryRatingError(
      'You have not been given any memories in this conversation yet, so there is nothing to rate.',
    );
  }

  const versions = new Map<string, number>();

  for (const item of memoryRecalledCodec.decode(parseJSONObject(newest.payload)).items) {
    versions.set(item.itemID, Math.max(item.version, versions.get(item.itemID) ?? 0));
  }

  return { sequence: newest.sequence, versions };
}
