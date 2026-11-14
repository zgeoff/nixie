import { buildShortIDFromUUID } from '@heynixie/db';
import type { Log, LogRecord } from '@heynixie/log';
import { collectToolResultUUIDs } from './collect-tool-result-uuids';
import { getItemShortID } from './get-item-short-id';
import type { ConsolidationTables } from './memory-consolidations';
import type { MomentTables } from './moment-context';
import type { ShortIDLookup } from './swapped-keys';
import type { MemoryTables } from './types';

// Reads, with one query per table, the short ID of each moment, item and change that a stored tool
// result of the records names by UUID. A batch with no UUID reads no row.
export async function readToolShortIDs(
  log: Pick<Log, 'writer'>,
  records: readonly LogRecord[],
): Promise<ShortIDLookup> {
  const found = { moment: new Set<string>(), item: new Set<string>(), change: new Set<string>() };

  for (const record of records) {
    if (record.kind === 'tool_result' && record.erasable.status === 'readable') {
      const fields = record.erasable.fields;

      if (typeof fields['message'] !== 'string') {
        collectToolResultUUIDs(fields['result'], found);
      }
    }
  }

  const db = log.writer.db;

  const [moment, item, change] = await Promise.all([
    found.moment.size === 0
      ? []
      : db
          .$extendTables<MomentTables>()
          .selectFrom('moments')
          .select(['moment_id', 'short_id'])
          .where('moment_id', 'in', [...found.moment])
          .where('state', 'in', ['active', 'retired'])
          .execute(),
    found.item.size === 0
      ? []
      : db
          .$extendTables<MemoryTables>()
          .selectFrom('memory_items')
          .select(['item_id', 'short_id'])
          .where('item_id', 'in', [...found.item])
          .execute(),
    found.change.size === 0
      ? []
      : db
          .$extendTables<ConsolidationTables>()
          .selectFrom('memory_consolidation_changes')
          .select(['change_id', 'short_id'])
          .where('change_id', 'in', [...found.change])
          .execute(),
  ]);

  return {
    moment: new Map(moment.map((row) => [row.moment_id, row.short_id])),
    item: new Map(item.map((row) => [row.item_id, getItemShortID(row)])),
    change: new Map(
      change.map((row) => [row.change_id, row.short_id ?? buildShortIDFromUUID(row.change_id)]),
    ),
  };
}
