import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { ImageOfferError } from './image-offer-error';
import type { MemoryTables } from './types';

// Refuses a second save of one offer. It runs inside the version's transaction, so 2 answers that
// race never both apply.
export async function requireOpenOffer(
  db: Kysely<MemoryTables>,
  offerSequence: number,
): Promise<void> {
  const row = await db
    .selectFrom('memory_versions')
    .select('item_id')
    .where(sql<number>`json_extract(checks, '$.offer.sequence')`, '=', offerSequence)
    .limit(1)
    .executeTakeFirst();

  if (row !== undefined) {
    throw new ImageOfferError('The owner already said yes to that offer, so it is saved once.');
  }
}
