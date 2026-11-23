import { readRecords } from '@heynixie/log';
import { memoryRecalledCodec } from '@heynixie/sessions';
import type { StoreParts } from '../types';
import { collectMemoryUsage } from './collect-memory-usage';
import { readRecallCalls } from './read-recall-calls';
import type { MemoryUsage, RecalledEntry } from './types';

// The usage of every item from the records written before the sequence: the recalled records, and
// the recall calls that tell a search and a recall by ID from a push. It writes nothing.
export async function readMemoryUsage(
  parts: StoreParts,
  beforeSequence: number,
): Promise<MemoryUsage> {
  const [entries, calls] = await Promise.all([
    readRecalledEntries(parts, beforeSequence),
    readRecallCalls(parts, beforeSequence),
  ]);

  return collectMemoryUsage(entries, calls);
}

const pageSize = 500;

async function readRecalledEntries(
  parts: StoreParts,
  beforeSequence: number,
): Promise<readonly RecalledEntry[]> {
  const entries: RecalledEntry[] = [];
  let after = 0;
  let size = pageSize;

  while (size === pageSize) {
    const page = await readRecords(parts.context.log, {
      afterSequence: after,
      beforeSequence,
      kinds: [memoryRecalledCodec.kind],
      limit: pageSize,
    });

    for (const entry of page) {
      const record = entry.record;
      const decoded = memoryRecalledCodec.tryDecodePartial(record.payload);

      if (decoded?.items !== undefined) {
        entries.push({
          sequence: record.sequence,
          thread: record.thread,
          recordedAtMs: record.recordedAt.getTime(),
          itemIDs: decoded.items.map((item) => item.itemID),
          triggers: new Map(
            decoded.items.flatMap((item) =>
              item.triggers === undefined ? [] : [[item.itemID, item.triggers] as const],
            ),
          ),
          hasSearchMode: decoded.searchMode !== undefined,
          isTurnNote: decoded.isTurnNote === true,
        });
      }
    }

    size = page.length;
    after = page.at(-1)?.record.sequence ?? after;
  }

  return entries;
}
