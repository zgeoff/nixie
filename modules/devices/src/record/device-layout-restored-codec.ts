import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const emptiedSchema = z.array(z.string());

export const deviceLayoutRestoredCodec = defineRecordCodec(
  'device.layout_restored',
  z.object({
    device: z.string(),
    name: z.string(),

    // the short ID of the device.layout_set record the restore wrote
    layoutID: z.string(),

    // the regions that came back blank, because the content they held was forgotten
    emptied: emptiedSchema,
  }),
);
