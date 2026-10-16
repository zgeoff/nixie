import type { LogTables } from '@heynixie/log';
import { memoryRecalledCodec } from '@heynixie/sessions';
import { sql } from 'kysely';
import { MemoryRatingError } from './memory-rating-error';
import type { StoreParts } from './types';

export interface LatestRecall {
  readonly sequence: number;

  // the newest version the recall delivered of each item, by item ID
  readonly versions: ReadonlyMap<string, number>;
}

// Reads the newest recall in the thread that a rating binds to: the turn's retrieval, or a recall
// the model asked for since. A turn note's recall is passed over, because the note reads its items
// after the turn's retrieval and would otherwise hide it.
export async function readLatestRecall(parts: StoreParts, thread: string): Promise<LatestRecall> {
  const newest = await parts.context.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(['sequence', 'payload'])
    .where('kind', '=', 'memory.recalled')
    .where('thread', '=', thread)
    .where(sql<boolean>`json_extract(records.payload, '$.isTurnNote') is null`)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (newest === undefined) {
    throw new MemoryRatingError(
      'You have not been given any memories in this conversation yet, so there is nothing to rate.',
    );
  }

  const versions = new Map<string, number>();

  for (const item of memoryRecalledCodec.decode(JSON.parse(newest.payload)).items) {
    versions.set(item.itemID, Math.max(item.version, versions.get(item.itemID) ?? 0));
  }

  return { sequence: newest.sequence, versions };
}
