import { readRecords } from '@heynixie/log';
import { readRetopicItems } from '../retopic/read-retopic-items';
import type { StoreParts } from '../types';
import { readRecordKeyID } from '../utils/read-record-key-id';
import { parseFoldOrderRecord } from './parse-fold-order-record';

const pageSize = 200;

// A fold order keeps the name of its topic, which is label text. This reads the key of each record
// that sets the order of a topic that no item but the given one holds under that subject, so the
// forget of the last item of a topic deletes the name with it. The caller holds the store lock.
export async function readOrphanFoldOrderKeyIDs(
  parts: Pick<StoreParts, 'context' | 'labels'>,
  itemID: string,
): Promise<readonly string[]> {
  const log = parts.context.log;

  const items = await readRetopicItems(parts);

  const held = new Set(
    items
      .filter((item) => item.itemID !== itemID)
      .map((item) => `${item.subject}/${getRoot(item.labels.topic)}`),
  );

  const keyIDs: string[] = [];
  let afterSequence = 0;

  for (;;) {
    const page = await readRecords(log, {
      afterSequence,
      kinds: ['memory.fold_ordered'],
      limit: pageSize,
    });

    for (const entry of page) {
      const setting = parseFoldOrderRecord(entry.record);

      if (setting !== null && !held.has(`${setting.subject}/${getRoot(setting.topic)}`)) {
        const keyID = await readRecordKeyID(log, entry.record.sequence);

        if (keyID !== null) {
          keyIDs.push(keyID);
        }
      }

      afterSequence = entry.record.sequence;
    }

    if (page.length < pageSize) {
      return keyIDs;
    }
  }
}

function getRoot(topic: string): string {
  return (topic.split('/', 1)[0] ?? topic).toLowerCase();
}
