import type { Log } from '@heynixie/log';
import type { MomentTables } from './moment-context';
import type { MemoryTables } from './types';

export type ForgetFloorCause = { readonly itemID: string } | { readonly momentID: string };

// The lowest event log sequence at which the forgotten text can exist: the first record of a memory
// item, or the first record of a moment's text. A request taken in before it cannot hold the text.
// It returns null when no record is found, and the caller then treats every request as covered.
export async function readForgetFloor(
  log: Pick<Log, 'writer'>,
  cause: ForgetFloorCause,
): Promise<number | null> {
  const db = log.writer.db.$extendTables<MemoryTables & MomentTables>();

  if ('momentID' in cause) {
    const row = await db
      .selectFrom('moment_texts')
      .select((eb) => eb.fn.min('sequence').as('floor'))
      .where('moment_id', '=', cause.momentID)
      .executeTakeFirst();

    return row?.floor ?? null;
  }

  const created = await db
    .selectFrom('memory_items')
    .select('created_sequence')
    .where('item_id', '=', cause.itemID)
    .executeTakeFirst();

  const versions = await db
    .selectFrom('memory_versions')
    .select((eb) => eb.fn.min('sequence').as('floor'))
    .where('item_id', '=', cause.itemID)
    .executeTakeFirst();

  const proposals = await db
    .selectFrom('memory_proposals')
    .select((eb) => eb.fn.min('created_sequence').as('floor'))
    .where('item_id', '=', cause.itemID)
    .executeTakeFirst();

  const floors = [created?.created_sequence, versions?.floor, proposals?.floor].filter(
    (floor) => floor !== undefined && floor !== null,
  );

  return floors.length === 0 ? null : Math.min(...floors);
}
