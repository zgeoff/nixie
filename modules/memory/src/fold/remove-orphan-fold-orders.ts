import { readRecords, removeRecordKey } from '@heynixie/log';
import { readRetopicItems } from '../retopic/read-retopic-items';
import type { StoreParts } from '../types';
import { readRecordKeyID } from '../utils/read-record-key-id';
import { parseFoldOrderRecord } from './parse-fold-order-record';

const pageSize = 200;

// A fold order keeps the name of its topic, which is label text. After the forget of an item, this
// removes the key of each record that sets the order of a topic that no item holds under that
// subject any more, so the name goes with the last item.
export async function removeOrphanFoldOrders(parts: StoreParts): Promise<void> {
  const log = parts.context.log;

  const items = await readRetopicItems(parts);

  const held = new Set(items.map((item) => `${item.subject}/${getRoot(item.labels.topic)}`));

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
          await removeRecordKey(log, keyID);
        }
      }

      afterSequence = entry.record.sequence;
    }

    if (page.length < pageSize) {
      return;
    }
  }
}

function getRoot(topic: string): string {
  return (topic.split('/', 1)[0] ?? topic).toLowerCase();
}
