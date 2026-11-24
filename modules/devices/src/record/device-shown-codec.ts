import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const deviceShownCodec = defineRecordCodec(
  'device.shown',
  z.object({
    device: z.string(),
    until: z.number().int().nullable(),

    // how long a show lasts once its device is online, for a show that waited for an offline one
    lastsMs: z.number().int().nullable().exactOptional(),
  }),
);
