import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const deviceRegionShownCodec = defineRecordCodec(
  'device.region_shown',
  z.object({
    device: z.string(),
    region: z.string(),

    // the short ID the assistant reads
    shownID: z.string(),
    contentKind: z.enum(['markdown', 'image', 'live', 'html']),

    // the time the content ends, or null for content that lasts until the next one
    until: z.number().int().nullable(),

    // what shows when the content ends
    onEnd: z.enum(['blank', 'previous']),

    // the record of the content that this one covered, for an `onEnd` of 'previous'
    previous: z.number().int().nullable(),

    // the sequence of the call that showed the content, which the rules are asked about again
    // when a declared fetch of the page refreshes; a record from before declared fetches holds none
    call: z.number().int().nullable().default(null),
  }),
);
