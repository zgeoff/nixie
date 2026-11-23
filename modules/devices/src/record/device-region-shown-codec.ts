import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const deviceRegionShownCodec = defineRecordCodec(
  'device.region_shown',
  z.object({
    device: z.string(),
    region: z.string(),

    // the short ID the assistant reads
    shownID: z.string(),
    contentKind: z.enum(['markdown', 'image', 'live']),

    // the time the content ends, or null for content that lasts until the next one
    until: z.number().int().nullable(),

    // what shows when the content ends
    onEnd: z.enum(['blank', 'previous']),

    // the record of the content that this one covered, for an `onEnd` of 'previous'
    previous: z.number().int().nullable(),
  }),
);
