import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const deviceLayoutSavedCodec = defineRecordCodec(
  'device.layout_saved',
  z.object({
    device: z.string(),
    name: z.string(),

    // true when the save replaced a layout saved under the same name
    isReplaced: z.boolean(),
  }),
);
