import type { EnvelopeRecord } from '@heynixie/log';
import { z } from 'zod';

const pinNoticed = z.strictObject({
  itemID: z.string(),
  isPinned: z.boolean(),
  noticeKey: z.string(),
});

export interface PinNoticeRecord {
  readonly kind: 'memory.pin_noticed';
  readonly itemID: string;
  readonly isPinned: boolean;
  readonly noticeKey: string;
}

export function parsePinNoticeRecord(record: EnvelopeRecord): PinNoticeRecord | null {
  if (record.kind !== 'memory.pin_noticed') {
    return null;
  }

  return { kind: record.kind, ...pinNoticed.parse(record.payload) };
}
