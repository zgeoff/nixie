import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// One fire that the owner pushed back or dropped. `until` set holds the slot until that instant
// (a snooze), and `until` null drops the slot (a skip). It moves a watermark or holds a slot, and
// leaves the definition's version alone. It sits on no thread.
export const triggerDeferredCodec = defineRecordCodec(
  'trigger.deferred',
  z.object({
    definitionID: z.string(),

    // ISO instant of the slot
    slot: z.string(),

    // ISO instant the hold ends, or null to drop the slot
    until: z.string().nullable(),
  }),
);
