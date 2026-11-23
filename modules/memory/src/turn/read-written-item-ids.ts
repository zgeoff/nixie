import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { StoreParts } from '../types';
import type { WrittenItemsQuery } from './types';

const pageSize = 500;

// The items that a memory write on the thread touched after the sequence: a new version, a label
// edit or a pin. Writes from the owner's own screens carry no thread, so they never count.
export async function readWrittenItemIDs(
  parts: StoreParts,
  query: WrittenItemsQuery,
): Promise<readonly string[]> {
  const itemIDs = new Set<string>();

  let after = query.afterSequence;
  let size = pageSize;

  while (size === pageSize) {
    const page = await readRecords(parts.context.log, {
      afterSequence: after,
      thread: query.thread,
      kinds: ['memory.version_added', 'memory.labelled', 'memory.pinned'],
      limit: pageSize,
    });

    for (const entry of page) {
      const itemID = pickItemID(entry.record);

      if (itemID !== null) {
        itemIDs.add(itemID);
      }
    }

    size = page.length;
    after = page.at(-1)?.record.sequence ?? after;
  }

  return [...itemIDs];
}

function pickItemID(record: LogRecord): string | null {
  const itemID = record.payload['itemID'];

  return typeof itemID === 'string' ? itemID : null;
}
