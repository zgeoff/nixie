import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { ImageRef } from './gate-types';

export interface ImageOfferQuery {
  readonly thread: string;
  readonly image: ImageRef;
}

// Finds the sequence of the memory.image_offered record for an image in the thread, or null when
// the model made no offer for it. It takes any handle, so a write transaction reads its own view.
export async function findImageOfferSequence(
  db: Kysely<unknown>,
  query: ImageOfferQuery,
): Promise<number | null> {
  const row = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'memory.image_offered')
    .where('thread', '=', query.thread)
    .where(
      sql<number>`json_extract(payload, '$.messageSequence')`,
      '=',
      query.image.messageSequence,
    )
    .where(sql<number>`json_extract(payload, '$.image')`, '=', query.image.image)
    .orderBy('sequence')
    .limit(1)
    .executeTakeFirst();

  return row?.sequence ?? null;
}
