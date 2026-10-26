import type { Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { MomentTables } from './moment-types';
import { parseMemoryRecord } from './parse-memory-record';
import { parseMomentRecord } from './parse-moment-record';

export const momentLinksProjection: Projection = {
  table: 'moment_links',
  keyColumn: 'link_key',
  fold: async (tx, record) => {
    const db = tx.$extendTables<MomentTables>();
    const memory = parseMemoryRecord(record);

    // a link goes with its memory item once that item's forget starts
    if (memory?.kind === 'memory.forget_started') {
      return removeLinks(db, 'item_id', memory.itemID);
    }

    const parsed = parseMomentRecord(record);

    if (parsed?.kind === 'moment_destroyed' && parsed.stage === 'started') {
      return removeLinks(db, 'moment_id', parsed.momentID);
    }

    if (parsed?.kind !== 'moment_linked') {
      return [];
    }

    const linkKey = `${parsed.momentID}:${parsed.itemID}`;

    if (!parsed.isLinked) {
      await db.deleteFrom('moment_links').where('link_key', '=', linkKey).execute();

      return [linkKey];
    }

    await db
      .insertInto('moment_links')
      .values({
        link_key: linkKey,
        moment_id: parsed.momentID,
        item_id: parsed.itemID,
        linked_sequence: record.sequence,
      })
      .execute();

    return [linkKey];
  },
};

async function removeLinks(
  db: Transaction<MomentTables>,
  column: 'item_id' | 'moment_id',
  id: string,
): Promise<readonly string[]> {
  const removed = await db
    .deleteFrom('moment_links')
    .where(column, '=', id)
    .returning('link_key')
    .execute();

  return removed.map((row) => row.link_key);
}
