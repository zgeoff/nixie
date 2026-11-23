import { readRecords } from '@heynixie/log';
import type { TopicFoldOrder } from '../index-block/collect-topic-rows';
import type { StoreParts } from '../types';
import { parseFoldOrderRecord } from './parse-fold-order-record';

const pageSize = 200;

// The folded order of each topic that has one, from the records that set it. A later record of the
// same subject and topic replaces an earlier one, and the match ignores case.
export async function readFoldOrders(
  parts: Pick<StoreParts, 'context'>,
): Promise<readonly TopicFoldOrder[]> {
  const latest = new Map<string, TopicFoldOrder>();

  let afterSequence = 0;

  for (;;) {
    const page = await readRecords(parts.context.log, {
      afterSequence,
      kinds: ['memory.fold_ordered'],
      limit: pageSize,
    });

    for (const entry of page) {
      const record = entry.record;
      const parsed = parseFoldOrderRecord(record);

      if (parsed !== null) {
        latest.set(`${parsed.subject}/${parsed.topic.toLowerCase()}`, parsed);
      }

      afterSequence = record.sequence;
    }

    if (page.length < pageSize) {
      return [...latest.values()];
    }
  }
}
