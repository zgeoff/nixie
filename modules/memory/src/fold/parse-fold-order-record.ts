import type { LogRecord } from '@heynixie/log';
import { z } from 'zod';
import type { TopicFoldOrder } from '../index-block/collect-topic-rows';

const payload = z.looseObject({
  subject: z.enum(['owner', 'self', 'shared']),
  order: z.enum(['newest', 'oldest']),
});

// The topic sits in the record's erasable fields, so a record whose key is gone reads as no setting.
export function parseFoldOrderRecord(record: LogRecord): TopicFoldOrder | null {
  const erasable = record.erasable;

  if (record.kind !== 'memory.fold_ordered' || erasable.status !== 'readable') {
    return null;
  }

  const topic = erasable.fields['topic'];
  const parsed = payload.parse(record.payload);

  return typeof topic === 'string' ? { subject: parsed.subject, topic, order: parsed.order } : null;
}
